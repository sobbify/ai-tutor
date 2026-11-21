"""Spoken lines in Gemini's native voice (the same Live model and voices as the Live tutor).

The parent's lines and the coach's "say it like this" lines are fixed or come from feedback, so they
are synthesised once, checked, and cached on disk as WAV:

* Gemini Live performs each line with a voice-actor prompt. The take is checked against the line
  (Gemini's own transcript, or a quick transcription when that's missing) and retried if words were
  added or dropped.
* Every published line is synthesised in the background at startup, so playback is instant.
* Only text the app itself shows the learner can be voiced (see ``VoiceService.allowed``), so the
  endpoint can't be used as a general text-to-speech service.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, ClassVar, Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from ..logs import log
from ..models import Learner, Moment
from .audio import VOICE_RATE, duration_ms, pcm_to_wav, plausible_duration, similarity, trim_silence
from .content import published_moments
from .keys import Candidate, KeyPool

CACHE_VERSION = "1"  # bump to re-record everything (e.g. after a prompt change)
ACCEPT = 0.9  # letter similarity for a take to be used straight away
FALLBACK_ACCEPT = 0.75  # the best of all takes is still used above this
TRANSCRIPT_GRACE = 0.8  # seconds to wait for transcript text once the audio is complete
CHECK_TIMEOUT = 5.0  # the fallback transcription is skipped (length check only) if it's slower


class VoiceUnavailable(RuntimeError):
    """No take could be produced; the browser falls back to its own voice."""


@dataclass(frozen=True)
class VoiceProfile:
    voice: str
    persona: str


class Synthesizer(Protocol):
    name: str

    async def synthesize(self, text: str, profile: VoiceProfile) -> bytes:
        """Return PCM16 mono 24 kHz audio of ``text`` read aloud."""
        ...


READ_PROMPT = """\
You are a voice actor recording lines for an English-speaking practice app used by preschool
teachers in India. Every message you receive is one line of dialogue from the script.
Perform that line aloud exactly as written, word for word, as {persona}.
Sound natural and human: warm, relaxed, conversational pace, clear Indian English.
Do not add, drop or change any words, even if the line has grammar mistakes. Never reply to the
line, answer its question, greet, explain or say anything else.
"""

AUTH_HINTS = ("401", "403", "API key", "API_KEY", "PERMISSION", "UNAUTHENTICATED")


class GeminiLiveSynthesizer:
    name = "gemini-live"

    def __init__(
        self, pool: KeyPool, model: str, *, check_model: str = "", takes: int = 3, timeout: float = 25.0
    ) -> None:
        self.pool = pool
        self.model = model
        self.check_model = check_model
        self.takes = takes
        self.timeout = timeout

    def _config(self, profile: VoiceProfile) -> Any:
        from google.genai import types

        return types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            system_instruction=types.Content(parts=[types.Part(text=READ_PROMPT.format(persona=profile.persona))]),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=profile.voice)
                )
            ),
            output_audio_transcription=types.AudioTranscriptionConfig(),
        )

    async def _take(self, cand: Candidate, text: str, profile: VoiceProfile) -> tuple[bytes, str]:
        loop = asyncio.get_running_loop()
        chunks: list[bytes] = []
        said: list[str] = []
        connect = self.pool.client(cand).aio.live.connect(model=self.model, config=self._config(profile))
        async with connect as session:
            await session.send_realtime_input(text=text)
            stream = session.receive().__aiter__()
            generated_at: float | None = None
            while True:
                # All audio has arrived at generation_complete; turn_complete only comes once it would
                # have finished *playing* (seconds later). Wait briefly for trailing transcript text.
                wait = None if generated_at is None else max(0.0, generated_at + TRANSCRIPT_GRACE - loop.time())
                try:
                    msg = await asyncio.wait_for(stream.__anext__(), wait)
                except (StopAsyncIteration, asyncio.TimeoutError):
                    break
                sc = msg.server_content
                if sc is None:
                    continue
                if sc.model_turn:
                    for part in sc.model_turn.parts or []:
                        if part.inline_data and part.inline_data.data:
                            chunks.append(part.inline_data.data)
                if sc.output_transcription and sc.output_transcription.text:
                    said.append(sc.output_transcription.text)
                if sc.generation_complete and generated_at is None:
                    generated_at = loop.time()
                if sc.turn_complete:
                    break
        return b"".join(chunks), "".join(said)

    async def _transcribe(self, cand: Candidate, pcm: bytes) -> str:
        """Gemini's Live transcript of its own speech is sometimes missing: ask a fast model instead."""
        from google.genai import types

        if not self.check_model:
            return ""
        contents: list[Any] = [
            "Transcribe this speech exactly, word for word. Reply with the words only.",
            types.Part.from_bytes(data=pcm_to_wav(pcm, VOICE_RATE), mime_type="audio/wav"),
        ]
        response = await self.pool.client(cand).aio.models.generate_content(
            model=self.check_model,
            contents=contents,
            config=types.GenerateContentConfig(temperature=0),
        )
        return response.text or ""

    async def synthesize(self, text: str, profile: VoiceProfile) -> bytes:
        best: tuple[float, bytes] = (0.0, b"")
        for cand in self.pool.candidates():
            for _ in range(self.takes):
                try:
                    pcm, said = await asyncio.wait_for(self._take(cand, text, profile), self.timeout)
                except Exception as exc:  # noqa: BLE001 - network, quota, auth → next key
                    log.warning("voice_take_failed", key=cand.label, error=type(exc).__name__)
                    if any(h in str(exc) for h in AUTH_HINTS):
                        self.pool.mark_bad(cand)
                    break
                self.pool.mark_good(cand)
                if pcm and not said.strip():
                    with contextlib.suppress(Exception):
                        said = await asyncio.wait_for(self._transcribe(cand, pcm), CHECK_TIMEOUT)
                if said.strip():
                    score = similarity(text, said)
                else:  # couldn't check the words (transcript missing, checker busy): judge by length alone
                    score = ACCEPT if plausible_duration(text, duration_ms(pcm, VOICE_RATE)) else 0.0
                if pcm and score >= ACCEPT:
                    return trim_silence(pcm, VOICE_RATE)
                log.info("voice_take_rejected", score=round(score, 2))
                if pcm and score > best[0]:
                    best = (score, pcm)
            if best[0] >= FALLBACK_ACCEPT:
                break
        if best[0] >= FALLBACK_ACCEPT:
            return trim_silence(best[1], VOICE_RATE)
        raise VoiceUnavailable("no usable take")


class VoiceService:
    """Disk cache + de-duplicated synthesis + the allow-list of speakable text."""

    def __init__(
        self,
        synth: Synthesizer | None,
        cache_dir: Path,
        *,
        parent_voice: str,
        coach_voice: str,
        model_tag: str,
        concurrency: int = 2,
    ) -> None:
        self.synth = synth
        self.cache_dir = cache_dir
        self.parent_voice = parent_voice
        self.coach_voice = coach_voice
        self.model_tag = model_tag
        self._locks: dict[str, asyncio.Lock] = {}
        self._sem = asyncio.Semaphore(concurrency)

    @property
    def enabled(self) -> bool:
        return self.synth is not None

    TONES: ClassVar[dict[int, str]] = {
        1: "calm and friendly",
        2: "friendly but busy",
        3: "worried and anxious",
        4: "upset, frustrated and talking fast",
    }

    def parent(self, m: Moment, level: int = 1) -> VoiceProfile:
        if m.kind == "baseline":  # the first chat is ELSA herself
            return VoiceProfile(self.coach_voice, "ELSA, a warm, encouraging English coach meeting a teacher")
        tone = self.TONES.get(level, self.TONES[1])
        return VoiceProfile(
            self.parent_voice,
            f"{m.character_name}, an Indian parent talking to their child's preschool teacher — {tone}",
        )

    def coach(self) -> VoiceProfile:
        return VoiceProfile(self.coach_voice, "a kind, confident Indian preschool teacher talking to a parent")

    def _path(self, text: str, profile: VoiceProfile) -> Path:
        key = "|".join((CACHE_VERSION, self.model_tag, profile.voice, profile.persona, text))
        return self.cache_dir / f"{hashlib.sha256(key.encode()).hexdigest()}.wav"

    def cached(self, text: str, profile: VoiceProfile) -> bool:
        return self._path(text, profile).is_file()

    async def wav(self, text: str, profile: VoiceProfile) -> bytes:
        path = self._path(text, profile)
        if path.is_file():
            return await asyncio.to_thread(path.read_bytes)
        if self.synth is None:
            raise VoiceUnavailable("voice disabled")
        lock = self._locks.setdefault(path.name, asyncio.Lock())
        async with lock:
            if path.is_file():  # made while we waited
                return await asyncio.to_thread(path.read_bytes)
            async with self._sem:
                pcm = await self.synth.synthesize(text, profile)
            data = pcm_to_wav(pcm, VOICE_RATE)
            await asyncio.to_thread(self._write, path, data)
        self._locks.pop(path.name, None)
        return data

    @staticmethod
    def _write(path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_bytes(data)
        os.replace(tmp, path)  # atomic: readers never see half a file

    # ---- what may be spoken -----------------------------------------------------------------

    async def allowed(self, db: AsyncSession, learner: Learner, text: str) -> VoiceProfile | None:
        """The profile to speak ``text`` with, or None if the app never shows this learner that text."""
        from .learner import allowed_source  # local import: learner imports journey → voice-free

        for m in await published_moments(db):
            for t in m.turns:
                if t.parent_line == text:
                    return self.parent(m, t.min_level)
        return self.coach() if await allowed_source(db, learner, text) else None

    async def prewarm(self, sessionmaker: Any) -> None:
        """Record every published line that isn't cached yet (startup background task)."""
        if self.synth is None:
            return
        async with sessionmaker() as db:
            moments = await published_moments(db)
        jobs: list[tuple[str, VoiceProfile]] = []
        for m in moments:
            for t in m.turns:
                jobs.append((t.parent_line, self.parent(m, t.min_level)))
                if t.hint_kind == "sentence" and t.hint_text:
                    jobs.append((t.hint_text, self.coach()))
            for phrase in (m.lesson or {}).get("phrases", []):
                if phrase.get("text"):
                    jobs.append((str(phrase["text"]), self.coach()))
        todo = [(text, p) for text, p in jobs if not self.cached(text, p)]
        made = failures = 0
        for text, profile in todo:
            try:
                await self.wav(text, profile)
                made += 1
                failures = 0
            except VoiceUnavailable:
                failures += 1
                if failures >= 3:
                    log.warning("voice_prewarm_stopped", made=made, remaining=len(todo) - made)
                    return
        log.info("voice_prewarm_done", made=made, cached=len(jobs) - len(todo))


async def cancel(task: asyncio.Task[None] | None) -> None:
    if task and not task.done():
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
