"""`ai-tutor audio-check`: an end-to-end self-test of the realtime audio against real Gemini Live.

1. Voices a parent line and a teacher reply and checks Gemini read them word for word.
2. Streams the teacher reply, in 40 ms frames like the browser, through the realtime listener and
   reports how long after "Stop" the feedback arrived. Prints timings and the sample lines only.
"""

from __future__ import annotations

import asyncio
import time
from pathlib import Path

from ..config import Settings
from .audio import LISTEN_RATE, VOICE_RATE, duration_ms, pcm_to_wav, resample
from .evaluator import Evaluation, LineContext
from .keys import KeyPool, model_list, parse_keys
from .listen import GeminiLiveListener, LiveSpec, reply_spec, story_spec
from .story import StoryResult
from .voice import GeminiLiveSynthesizer, VoiceProfile

PARENT_LINE = "Good morning! She cried a little at home today. Will she be okay?"
TEACHER_REPLY = "Good morning! Don't worry, she settle in quickly. I will call you if she need you."
STORY = "Today Rohan's mother asked me why he cried. I told her he miss her in the morning but he play happily later."
CTX = LineContext(
    scene="Morning drop-off. Ria is holding her mother's hand at the classroom door.",
    character_name="Ria's mom",
    possessive="her",
    parent_line=PARENT_LINE,
    model_reply="Don't worry, she will settle in quickly.",
)


async def run(settings: Settings, save: Path | None = None) -> int:
    pool = KeyPool(parse_keys(settings.gemini_api_keys), settings.gemini_backend, settings.gemini_api_version)
    if not len(pool):
        print("No GEMINI_API_KEYS configured in backend/.env")
        return 1
    print(f"model={settings.gemini_live_model} voices={settings.parent_voice}/{settings.coach_voice} keys={len(pool)}")

    checker = model_list(settings.gemini_eval_model)[-1]
    synth = GeminiLiveSynthesizer(pool, settings.gemini_live_model, check_model=checker)
    t0 = time.perf_counter()
    parent = await synth.synthesize(PARENT_LINE, VoiceProfile(settings.parent_voice, "a friendly Indian parent"))
    print(f"voice: parent line, {duration_ms(parent, VOICE_RATE)} ms of audio in {time.perf_counter() - t0:.1f}s")
    t0 = time.perf_counter()
    teacher = await synth.synthesize(TEACHER_REPLY, VoiceProfile(settings.coach_voice, "a kind Indian teacher"))
    print(f"voice: teacher reply, {duration_ms(teacher, VOICE_RATE)} ms of audio in {time.perf_counter() - t0:.1f}s")
    if save:
        await asyncio.to_thread(save.write_bytes, pcm_to_wav(parent, VOICE_RATE))
        print(f"voice: saved {save}")

    listener = GeminiLiveListener(pool, settings.gemini_live_model)
    result = await _listen(listener, reply_spec(CTX), teacher, "reply")
    story_pcm = await synth.synthesize(STORY, VoiceProfile(settings.coach_voice, "a kind Indian teacher"))
    story = await _listen(listener, story_spec(), story_pcm, "story")
    ok = isinstance(result, Evaluation) and result.heard and isinstance(story, StoryResult) and story.heard
    return 0 if ok else 2


async def _listen(listener: GeminiLiveListener, spec: LiveSpec, pcm: bytes, label: str) -> object:
    mic = resample(pcm, VOICE_RATE, LISTEN_RATE)
    frame = LISTEN_RATE * 2 * 40 // 1000
    t1 = time.perf_counter()
    result: object = None
    stopped = 0.0
    async with listener.open(spec) as session:
        print(f"{label}: connected in {time.perf_counter() - t1:.1f}s")

        async def speak() -> None:
            nonlocal stopped
            for i in range(0, len(mic), frame):
                await session.send_audio(mic[i : i + frame])
                await asyncio.sleep(0.04)  # real time, like a microphone
            stopped = time.perf_counter()
            await session.finish()

        speaker = asyncio.create_task(speak())
        async for event in session.events():
            if not isinstance(event, str):
                result = event
                break
            print(f"{label}: caption {event!r}")
        await speaker
    if result is None:
        print(f"{label}: no result from Gemini Live (the app would fall back to the evaluator)")
        return None
    print(f"{label}: result {time.perf_counter() - stopped:.2f}s after Stop")
    print(f"{label}: {result!r}")
    return result
