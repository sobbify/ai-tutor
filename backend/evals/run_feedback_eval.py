# ruff: noqa: T201  (a developer script: console output)
"""Feedback-quality eval: runs every case in feedback_cases.json through the real coach.

    GEMINI_API_KEYS=... python -m evals.run_feedback_eval              # text path (fallback evaluator)
    GEMINI_API_KEYS=... python -m evals.run_feedback_eval --live       # realtime path (voiced replies → Gemini Live)
    ... --only future-will,plural  --model gemini-3.5-flash  --repeat 2

Prints one line per case (✓ / ✗ and why) and a score. Never prints keys. Transcripts here are
scripted test sentences, not anyone's real speech.
"""

from __future__ import annotations

import argparse
import asyncio
import difflib
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

from ai_tutor.config import Settings
from ai_tutor.services.content import load_file
from ai_tutor.services.evaluator import Evaluation, GeminiEvaluator, LineContext
from ai_tutor.services.keys import KeyPool, parse_keys

ROOT = Path(__file__).resolve().parent
CONTENT = ROOT.parent.parent / "content" / "moments.json"
BANNED = re.compile(r"\b(accent|pronunciation|pronounce|mother tongue)\b", re.IGNORECASE)
HINDI = re.compile(r"\b(haan|usne|khana|kha|liya|nahi|accha|theek)\b", re.IGNORECASE)


def contexts() -> dict[tuple[str, int], LineContext]:
    out: dict[tuple[str, int], LineContext] = {}
    for m in load_file(CONTENT):
        for i, t in enumerate(m.turns):
            hint = t.hint.text if t.hint.kind == "sentence" else " / ".join(t.hint.options or [])
            out[(m.id, i)] = LineContext(
                scene=m.scene,
                character_name=m.character.name,
                possessive=m.possessive,
                parent_line=t.parent_line,
                model_reply=hint or "",
            )
    return out


def norm(s: str) -> str:
    return s.lower().replace("’", "'").strip(' .,!?"“”')


def check(case: dict[str, Any], r: Evaluation) -> list[str]:
    e, said, bad = case["expect"], case["said"], []
    if "heard" in e and r.heard != e["heard"]:
        bad.append(f"heard={r.heard}")
    if not r.heard:
        return bad if e.get("heard") is False else [*bad, "not heard"]
    if e.get("heard") is False:
        return bad
    fix = r.fix
    if "fix" in e and bool(fix) != e["fix"]:
        bad.append(f"fix={'yes: ' + fix.wrong + ' → ' + fix.better if fix else 'none'}")
    if fix:
        # Since several slips are reported, the expected one may be any of them (or in "corrected").
        wrongs = [norm(fix.wrong), *(norm(m.wrong) for m in r.more_fixes)]
        betters = [norm(fix.better), *(norm(m.better) for m in r.more_fixes), norm(r.corrected or "")]
        if e.get("wrong_any") and not any(
            norm(w) in got or (got and got in norm(w)) for w in e["wrong_any"] for got in wrongs
        ):
            bad.append(f"wrong='{fix.wrong}'")
        if e.get("better_has") and not any(norm(b) in got for b in e["better_has"] for got in betters):
            bad.append(f"better='{fix.better}'")
        for word in e.get("no_fix_on", []):
            if norm(word) in norm(fix.wrong):
                bad.append(f"flagged Indian-English '{word}'")
        if e.get("better_lang") == "en" and HINDI.search(fix.better):
            bad.append(f"better not English: '{fix.better}'")
        if not e.get("better_lang"):
            # `better` is her sentence that had the mistake, minimally corrected (or her whole reply).
            parts = [norm(said), *(norm(x) for x in re.split(r"(?<=[.!?,])\s+", said) if x.strip())]
            keep = max(difflib.SequenceMatcher(None, p, norm(fix.better)).ratio() for p in parts)
            if keep < 0.55:
                bad.append(f"rewrote her sentence ({keep:.2f}): '{fix.better}'")
        if not r.tip:
            bad.append("no tip")
        elif len(r.tip.split()) > 20:
            bad.append(f"tip too long ({len(r.tip.split())} words)")
    # Several slips at once: how many, which kinds, the whole reply corrected, one change each.
    slips = ([fix] if fix else []) + list(r.more_fixes)
    cats = ([r.category] if fix else []) + [m.category for m in r.more_fixes]
    if "slips_min" in e and len(slips) < e["slips_min"]:
        bad.append(f"slips={len(slips)} (want ≥{e['slips_min']}): {[s.wrong for s in slips]}")
    if "slips_max" in e and len(slips) > e["slips_max"]:
        bad.append(f"slips={len(slips)} (want ≤{e['slips_max']}): {[s.wrong for s in slips]}")
    for cat in e.get("categories_all", []):
        if cat not in cats:
            bad.append(f"no {cat} slip (got {cats})")
    for text in e.get("corrected_has", []):
        if norm(text) not in norm(r.corrected or ""):
            bad.append(f"corrected lacks '{text}': '{r.corrected}'")
    for word in e.get("no_fix_on", []):
        for m in r.more_fixes:
            if norm(word) in norm(m.wrong):
                bad.append(f"flagged Indian-English '{word}'")
    if e.get("each_one_change"):
        sentences = [x for x in re.split(r"(?<=[.!?])\s+", said) if x.strip()]
        for slip in slips:
            words = norm(slip.better).split()
            best = min(
                sentences,
                key=lambda x: -difflib.SequenceMatcher(None, norm(x).split(), words).ratio(),
            )
            ops = difflib.SequenceMatcher(None, norm(best).split(), words).get_opcodes()
            changed = sum(max(i2 - i1, j2 - j1) for tag, i1, i2, j1, j2 in ops if tag != "equal")
            if changed > 3:
                bad.append(f"'{slip.wrong}' changes {changed} words: '{slip.better}'")
    for key in ("answered", "polite"):
        if key in e and getattr(r, key) is not e[key]:
            bad.append(f"{key}={getattr(r, key)}")
    if "fillers_min" in e and (r.fillers or 0) < e["fillers_min"]:
        bad.append(f"fillers={r.fillers}")
    if not r.positives:
        bad.append("no positive")
    for text in [*r.positives, r.tip or ""]:
        if BANNED.search(text):
            bad.append(f"mentions accent: '{text}'")
    if any(len(p.split()) > 10 for p in r.positives):
        bad.append("long positive")
    return bad


async def run_text(case: dict[str, Any], ctx: LineContext, ev: GeminiEvaluator) -> Evaluation:
    return await ev.evaluate(ctx, audio=None, mime_type=None, transcript_hint=case["said"])


TTS_MODELS = ("gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts")


async def voice_exactly(text: str, pool: KeyPool) -> bytes:
    """Voice a test reply word for word, mistakes kept (a TTS model reads more literally than Live)."""
    from google.genai import types

    config = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Aoede"))
        ),
    )
    prompt = f"Read this aloud exactly as written, keeping every mistake, in a kind Indian English voice: {text}"
    last: Exception | None = None
    for cand in pool.candidates():
        for model in TTS_MODELS:
            try:
                r = await pool.client(cand).aio.models.generate_content(model=model, contents=prompt, config=config)
                data = r.candidates[0].content.parts[0].inline_data.data  # 24 kHz 16-bit mono PCM
                if data:
                    return data
            except Exception as exc:  # noqa: BLE001 - next model
                last = exc
    # TTS quota used up: Gemini Live reads it instead (it sometimes tidies grammar — see "heard as").
    from ai_tutor.services.voice import GeminiLiveSynthesizer, VoiceProfile

    try:
        synth = GeminiLiveSynthesizer(pool, Settings().gemini_live_model)
        return await synth.synthesize(text, VoiceProfile("Aoede", "a kind Indian teacher who keeps every mistake"))
    except Exception as exc:  # noqa: BLE001
        last = exc
    raise RuntimeError(f"could not voice the reply: {type(last).__name__ if last else 'empty'}")


async def run_live(case: dict[str, Any], ctx: LineContext, settings: Settings, pool: KeyPool) -> Evaluation | None:
    from ai_tutor.services.audio import LISTEN_RATE, VOICE_RATE, resample
    from ai_tutor.services.listen import GeminiLiveListener, reply_spec

    pcm = await voice_exactly(case["said"], pool)
    mic = resample(pcm, VOICE_RATE, LISTEN_RATE)
    frame = LISTEN_RATE * 2 * 40 // 1000
    listener = GeminiLiveListener(pool, settings.gemini_live_model)
    async with listener.open(reply_spec(ctx)) as session:
        for i in range(0, len(mic), frame):
            await session.send_audio(mic[i : i + frame])
            await asyncio.sleep(0.01)
        await session.finish()
        async for event in session.events():
            if isinstance(event, Evaluation):
                return event
    return None


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="voice each reply and stream it to Gemini Live")
    ap.add_argument("--only", default="")
    ap.add_argument("--model", default="")
    ap.add_argument("--repeat", type=int, default=1)
    ap.add_argument("--concurrency", type=int, default=6)
    args = ap.parse_args()
    settings = Settings()
    pool = KeyPool(parse_keys(settings.gemini_api_keys), settings.gemini_backend, settings.gemini_api_version)
    if not len(pool):
        print("Set GEMINI_API_KEYS (env or backend/.env)")
        return 1
    cases = json.loads((ROOT / "feedback_cases.json").read_text())["cases"]
    if args.only:
        wanted = set(args.only.split(","))
        cases = [c for c in cases if c["id"] in wanted]
    ctxs = contexts()
    model = args.model or settings.gemini_eval_model
    ev = GeminiEvaluator(pool, model)
    sem = asyncio.Semaphore(2 if args.live else args.concurrency)
    live = args.live
    print(f"path={'live ' + settings.gemini_live_model if live else 'text ' + model} cases={len(cases)}x{args.repeat}")

    async def one(case: dict[str, Any]) -> tuple[str, list[str], Evaluation | None, float]:
        async with sem:
            t0 = time.perf_counter()
            ctx = ctxs[(case["moment"], case["turn"])]
            try:
                if args.live:
                    r = await run_live(case, ctx, settings, pool)
                else:
                    r = await run_text(case, ctx, ev)
            except Exception as exc:  # noqa: BLE001
                return case["id"], [f"error {type(exc).__name__}: {str(exc)[:80]}"], None, time.perf_counter() - t0
            if r is None:
                return case["id"], ["no result"], None, time.perf_counter() - t0
            bad = check(case, r)
            heard_as = difflib.SequenceMatcher(None, norm(case["said"]), norm(r.transcript)).ratio()
            if args.live and r.heard and heard_as < 0.97:
                bad.append(f"(heard as: '{r.transcript}')")
            return case["id"], bad, r, time.perf_counter() - t0

    results = await asyncio.gather(*[one(c) for c in cases for _ in range(args.repeat)])
    passed = 0
    for cid, bad, r, secs in results:
        real = [b for b in bad if not b.startswith("(")]
        passed += not real
        detail = ""
        if r and r.fix:
            detail = f"  [{r.fix.wrong} → {r.fix.better} | tip: {r.tip}]"
        elif r:
            detail = f"  [{' / '.join(r.positives)}]"
        print(f"{'✓' if not real else '✗'} {cid:<22} {secs:4.1f}s {'; '.join(bad)}{detail}")
    print(f"\nscore {passed}/{len(results)}")
    return 0 if passed == len(results) else 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
