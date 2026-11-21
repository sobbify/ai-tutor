"""Small PCM helpers shared by the voice and listening services (no third-party audio libs)."""

from __future__ import annotations

import io
import re
import wave
from array import array
from difflib import SequenceMatcher

LISTEN_RATE = 16_000  # browser → Gemini Live: PCM16 mono 16 kHz (AudioWorklet downsampling)
VOICE_RATE = 24_000  # Gemini Live → us: PCM16 mono 24 kHz


def pcm_to_wav(pcm: bytes, rate: int) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)
    return buf.getvalue()


def wav_to_pcm(data: bytes) -> tuple[bytes, int]:
    with wave.open(io.BytesIO(data), "rb") as w:
        return w.readframes(w.getnframes()), w.getframerate()


def trim_silence(pcm: bytes, rate: int, threshold: int = 300, pad_ms: int = 80) -> bytes:
    """Drop near-silent samples at both ends (keeps a little padding so words aren't clipped)."""
    if len(pcm) < 4:
        return pcm
    samples = array("h")
    samples.frombytes(pcm[: len(pcm) - len(pcm) % 2])
    start = next((i for i, s in enumerate(samples) if abs(s) > threshold), None)
    if start is None:
        return pcm
    end = len(samples) - next(i for i, s in enumerate(reversed(samples)) if abs(s) > threshold)
    pad = rate * pad_ms // 1000
    return samples[max(0, start - pad) : min(len(samples), end + pad)].tobytes()


def duration_ms(pcm: bytes, rate: int) -> int:
    return len(pcm) * 1000 // (2 * rate)


_WORD = re.compile(r"[a-z0-9']+")


def words(text: str) -> list[str]:
    return _WORD.findall(text.lower().replace("’", "'"))


def similarity(expected: str, heard: str) -> float:
    """0..1 similarity of the letters spoken, used to check Gemini read a line as written.

    Letters rather than words: Gemini's transcripts sometimes glue words together ("settlequickly").
    """
    a, b = "".join(words(expected)), "".join(words(heard))
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b, autojunk=False).ratio()


def plausible_duration(text: str, ms: int) -> bool:
    """Is ``ms`` of speech a believable reading of ``text``? (~2–4 words a second, plus a pause)"""
    n = max(1, len(words(text)))
    return n * 250 <= ms <= n * 550 + 1000


def resample(pcm: bytes, src_rate: int, dst_rate: int) -> bytes:
    """Linear-interpolation resampler for PCM16 mono (self-checks only; the browser does the real work)."""
    src = array("h")
    src.frombytes(pcm[: len(pcm) - len(pcm) % 2])
    if not src or src_rate == dst_rate:
        return src.tobytes()
    n = int(len(src) * dst_rate / src_rate)
    out = array("h", bytes(2 * n))
    step = src_rate / dst_rate
    last = len(src) - 1
    for i in range(n):
        pos = i * step
        j = int(pos)
        frac = pos - j
        a = src[j]
        b = src[min(j + 1, last)]
        out[i] = int(a + (b - a) * frac)
    return out.tobytes()
