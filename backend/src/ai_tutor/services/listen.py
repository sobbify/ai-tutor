"""Realtime listening: the teacher's microphone is streamed to Gemini Live *while they speak*, so
when they tap Stop the model already has the whole reply. It answers through a ``give_feedback``
tool call about a second later — no upload, no second model call (the Live tutor reports its
corrections the same way).

Turn-taking is explicit: the teacher taps the mic to start and Stop to finish, so automatic voice
activity detection is off and the bridge sends ``activity_start`` / ``activity_end`` itself.
The model never speaks; anything it says is dropped. If the tool call doesn't arrive (or Live is
unreachable), the bridge falls back to the regular evaluator with the recorded audio.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass
from typing import Any, Protocol

from ..logs import log
from ..schemas import GrammarFix
from .audio import LISTEN_RATE
from .evaluator import SYSTEM_PROMPT, Evaluation, LineContext, clean_category, line_prompt
from .keys import KeyPool
from .story import STORY_PROMPT, StoryResult, clean

LIVE_INSTRUCTIONS = """
The teacher now speaks out loud, live. Stay completely silent: never speak.
When she has finished, call {tool} exactly once with your result.
"""
# Said first as well: without it the model sometimes answers out loud before calling the tool,
# which delays the result by as long as its spoken answer takes to play.
SILENT = "IMPORTANT: You never speak out loud. You only listen, then call {tool}.\n"

AUTH_HINTS = ("401", "403", "API key", "API_KEY", "PERMISSION", "UNAUTHENTICATED")

LiveEvent = Any  # a transcription chunk (str), or the final result (Evaluation / StoryResult)


@dataclass(frozen=True)
class LiveSpec:
    """What a listening session is for: its prompt, its result tool, and how to read the result."""

    prompt: str
    tool_name: str
    properties: dict[str, tuple[str, str]]  # name → (type, description)
    parse: Callable[[dict[str, Any]], Any]


class ListenSession(Protocol):
    async def send_audio(self, pcm: bytes) -> None: ...

    async def finish(self) -> None:
        """The teacher stopped speaking."""
        ...

    def events(self) -> AsyncIterator[LiveEvent]:
        """Transcription chunks, then (usually) one Evaluation; ends when the turn is over."""
        ...


class Listener(Protocol):
    name: str

    def open(self, spec: LiveSpec) -> AbstractAsyncContextManager[ListenSession]: ...


def _text(args: dict[str, Any], key: str, limit: int) -> str:
    return str(args.get(key) or "").strip()[:limit]


def _flag(args: dict[str, Any], key: str) -> bool | None:
    return bool(args[key]) if isinstance(args.get(key), bool) else None


def _count(args: dict[str, Any], key: str) -> int | None:
    value = args.get(key)
    return max(0, min(50, int(value))) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _positives(args: dict[str, Any], most: int) -> list[str]:
    raw = args.get("positives") or []
    return [str(p).strip()[:120] for p in raw if str(p).strip()][:most] if isinstance(raw, list) else []


def evaluation_from_args(args: dict[str, Any]) -> Evaluation | None:
    """Validate the model's tool-call arguments (never trust their shape)."""
    try:
        heard = bool(args.get("heard"))
        transcript = _text(args, "transcript", 2000)
        positives = _positives(args, 3)
        wrong, better = _text(args, "fix_wrong", 200), _text(args, "fix_better", 400)
    except (TypeError, ValueError):
        return None
    if not heard or not transcript:
        return Evaluation(heard=False, transcript=transcript, positives=[], fix=None)
    if not positives:
        return None
    return Evaluation(
        heard=True,
        transcript=transcript,
        positives=positives,
        fix=GrammarFix(wrong=wrong, better=better) if better else None,
        tip=(_text(args, "tip", 200) or None) if better else None,
        category=(clean_category(args.get("category")) or "grammar") if better else None,
        fillers=_count(args, "fillers"),
        answered=_flag(args, "answered"),
        polite=_flag(args, "polite"),
        intelligible=_flag(args, "intelligible"),
    )


def story_from_args(args: dict[str, Any]) -> StoryResult | None:
    try:
        better = _text(args, "fix_better", 400)
        result = StoryResult(
            heard=bool(args.get("heard")),
            transcript=_text(args, "transcript", 4000),
            positives=_positives(args, 2),
            fix=GrammarFix(wrong=_text(args, "fix_wrong", 200), better=better) if better else None,
            tip=_text(args, "tip", 200) or None,
            better_line=_text(args, "better_line", 300) or None,
            fillers=_count(args, "fillers"),
        )
    except (TypeError, ValueError):
        return None
    return clean(result)


_FILLERS = {"um", "umm", "uh", "uhh", "er", "erm", "hmm", "hm", "mm", "ah", "aah", "oh"}


def _words(text: str) -> list[str]:
    return [w for w in "".join(c.lower() if c.isalnum() or c == "'" else " " for c in text).split() if w]


def grounding(result_transcript: str, caption: str) -> str:
    """Compare Live's transcript with its own speech-to-text captions of the same audio.

    "ok"       — they agree (or there were no captions to compare with)
    "silence"  — the captions hold only filler sounds, yet the transcript has real words:
                 the model invented them, so treat it as not heard
    "doubtful" — they barely overlap: check the audio again with the regular evaluator
    """
    said = [w for w in _words(caption) if w not in _FILLERS]
    claimed = [w for w in _words(result_transcript) if w not in _FILLERS]
    if not caption.strip() or len(claimed) < 4:
        return "ok"
    if len(said) < 2:
        return "silence"
    overlap = len(set(said) & set(claimed)) / max(1, len(set(claimed)))
    return "ok" if overlap >= 0.3 else "doubtful"


_COMMON = {
    "heard": ("BOOLEAN", "False when there was no clear speech"),
    "transcript": ("STRING", "Exactly the words she said, mistakes kept; never guessed or completed"),
    "positives": ("ARRAY", "Short kind positives"),
    "fix_wrong": ("STRING", "The wrong word or phrase, or empty"),
    "fix_better": ("STRING", "The whole sentence with the mistake, minimally corrected (never a fragment), or empty"),
    "tip": ("STRING", "The grammar rule in under 16 words with a tiny example, or empty"),
    "category": ("STRING", "tense, agreement, article, preposition, word-order, plural, pronoun, word-choice, grammar"),
    "fillers": ("INTEGER", "How many filler sounds/words (um, uh, er, hmm)"),
}


def reply_spec(ctx: LineContext) -> LiveSpec:
    return LiveSpec(
        prompt=(
            f"{SILENT.format(tool='give_feedback')}{SYSTEM_PROMPT}\n{line_prompt(ctx, None)}\n"
            f"{LIVE_INSTRUCTIONS.format(tool='give_feedback')}"
        ),
        tool_name="give_feedback",
        properties={
            **_COMMON,
            "answered": ("BOOLEAN", "Did her reply respond to what the parent said?"),
            "polite": ("BOOLEAN", "Polite and warm rather than blunt?"),
            "intelligible": ("BOOLEAN", "Would a listener understand her words? (never accent)"),
        },
        parse=evaluation_from_args,
    )


def story_spec() -> LiveSpec:
    return LiveSpec(
        prompt=(
            f"{SILENT.format(tool='give_story_feedback')}{STORY_PROMPT}\n"
            f"{LIVE_INSTRUCTIONS.format(tool='give_story_feedback')}"
        ),
        tool_name="give_story_feedback",
        properties={
            **{k: v for k, v in _COMMON.items()},
            "transcript": ("STRING", "What she said with every person's name replaced by a role"),
            "better_line": ("STRING", "One polite sentence she could say to that parent next time"),
        },
        parse=story_from_args,
    )


def _tool(spec: LiveSpec) -> Any:
    from google.genai import types

    def schema(kind: str, description: str) -> Any:
        t = getattr(types.Type, kind)
        if kind == "ARRAY":
            return types.Schema(type=t, items=types.Schema(type=types.Type.STRING), description=description)
        return types.Schema(type=t, description=description)

    return types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name=spec.tool_name,
                description="Report the result once she has finished speaking. Call exactly once.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={name: schema(*v) for name, v in spec.properties.items()},
                    required=list(spec.properties),
                ),
            )
        ]
    )


class _GeminiListenSession:
    def __init__(self, session: Any, spec: LiveSpec) -> None:
        self._s = session
        self._spec = spec
        self._finished = False

    async def start(self) -> None:
        from google.genai import types

        await self._s.send_realtime_input(activity_start=types.ActivityStart())

    async def send_audio(self, pcm: bytes) -> None:
        from google.genai import types

        if not self._finished:
            await self._s.send_realtime_input(audio=types.Blob(data=pcm, mime_type=f"audio/pcm;rate={LISTEN_RATE}"))

    async def finish(self) -> None:
        from google.genai import types

        if not self._finished:
            self._finished = True
            await self._s.send_realtime_input(activity_end=types.ActivityEnd())

    async def events(self) -> AsyncIterator[LiveEvent]:
        while True:
            async for msg in self._s.receive():
                if msg.tool_call:
                    for fc in msg.tool_call.function_calls or []:
                        if fc.name == self._spec.tool_name and (result := self._spec.parse(dict(fc.args or {}))):
                            yield result
                            return
                sc = msg.server_content
                if sc is None:
                    continue
                if sc.input_transcription and sc.input_transcription.text:
                    yield sc.input_transcription.text
                if self._finished and sc.turn_complete:
                    return  # the model ended its turn without the tool call
            if self._finished:
                return


class GeminiLiveListener:
    name = "gemini-live"

    def __init__(self, pool: KeyPool, model: str, connect_timeout: float = 8.0) -> None:
        self.pool = pool
        self.model = model
        self.connect_timeout = connect_timeout

    def _config(self, spec: LiveSpec) -> Any:
        from google.genai import types

        return types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO],
            system_instruction=types.Content(parts=[types.Part(text=spec.prompt)]),
            input_audio_transcription=types.AudioTranscriptionConfig(),
            tools=[_tool(spec)],
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(disabled=True)
            ),
        )

    @asynccontextmanager
    async def open(self, spec: LiveSpec) -> AsyncIterator[ListenSession]:
        failed = 0
        for cand in self.pool.candidates():
            cm = self.pool.client(cand).aio.live.connect(model=self.model, config=self._config(spec))
            try:
                session = await asyncio.wait_for(cm.__aenter__(), self.connect_timeout)
            except Exception as exc:  # noqa: BLE001 - next key
                failed += 1
                log.warning("listen_connect_failed", key=cand.label, error=type(exc).__name__)
                if any(h in str(exc) for h in AUTH_HINTS):
                    self.pool.mark_bad(cand)
                continue
            self.pool.mark_good(cand)
            wrapped = _GeminiListenSession(session, spec)
            try:
                await wrapped.start()
                yield wrapped
            finally:
                with contextlib.suppress(Exception):
                    await cm.__aexit__(None, None, None)
            return
        raise ConnectionError(f"Gemini Live unavailable ({failed} candidates failed)")


class PresetEvaluator:
    """Hands a result Gemini Live already produced to ``Journey.reply`` (so it's stored the same way)."""

    name = "gemini-live"

    def __init__(self, result: Evaluation) -> None:
        self.result = result

    async def evaluate(
        self, ctx: LineContext, *, audio: bytes | None, mime_type: str | None, transcript_hint: str | None
    ) -> Evaluation:
        return self.result
