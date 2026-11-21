"""Gemini key pool — ported from the Live tutor. Round-robin over (key, endpoint) candidates;
keys that fail auth are parked. Supports Gemini API keys, Vertex express keys and Vertex ADC."""

from __future__ import annotations

import itertools
import json
import os
import threading
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from google import genai


def parse_keys(raw: str | None) -> list[str]:
    """Accept a JSON list, comma-separated, or newline-separated keys."""
    if not raw:
        return []
    raw = raw.strip()
    items: list[Any] = json.loads(raw) if raw.startswith("[") else raw.replace("\n", ",").split(",")
    keys = [str(k).strip().strip('"').strip("'") for k in items]
    return [k for k in keys if k]


def mask(key: str) -> str:
    return f"{key[:6]}…{key[-4:]}" if len(key) > 12 else "***"


@dataclass(frozen=True)
class Candidate:
    key: str | None  # None = Vertex with Application Default Credentials
    vertex: bool
    api_version: str = "v1beta"

    @property
    def label(self) -> str:
        if self.key is None:
            return f"ADC ({os.getenv('GOOGLE_CLOUD_PROJECT')})"
        return f"{mask(self.key)} ({'vertex' if self.vertex else 'gemini-api'})"

    def client(self) -> genai.Client:
        from google import genai
        from google.genai import types

        if self.key is None:
            return genai.Client(
                vertexai=True,
                project=os.getenv("GOOGLE_CLOUD_PROJECT"),
                location=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"),
            )
        if self.vertex:
            return genai.Client(vertexai=True, api_key=self.key)
        return genai.Client(api_key=self.key, http_options=types.HttpOptions(api_version=self.api_version))


class KeyPool:
    def __init__(self, keys: list[str], backend: str = "auto", api_version: str = "v1beta") -> None:
        if backend == "vertex-adc":
            self._all = [Candidate(None, True, api_version)]
        else:
            modes = {"gemini": [False], "vertex": [True]}.get(backend, [False, True])
            self._all = [Candidate(k, v, api_version) for k in keys for v in modes]
        self._bad: set[Candidate] = set()
        self._cycle = itertools.cycle(self._all) if self._all else None
        self._lock = threading.Lock()
        self._clients: dict[Candidate, genai.Client] = {}

    def __len__(self) -> int:
        return len(self._all)

    def candidates(self) -> list[Candidate]:
        with self._lock:
            if not self._cycle:
                return []
            start = next(self._cycle)
            i = self._all.index(start)
            ordered = self._all[i:] + self._all[:i]
            healthy = [c for c in ordered if c not in self._bad]
            return healthy or ordered

    def client(self, c: Candidate) -> genai.Client:
        # Hold one client per candidate for the app's lifetime (GC would close in-flight clients).
        with self._lock:
            if c not in self._clients:
                self._clients[c] = c.client()
            return self._clients[c]

    def mark_bad(self, c: Candidate) -> None:
        with self._lock:
            self._bad.add(c)

    def mark_good(self, c: Candidate) -> None:
        with self._lock:
            self._bad.discard(c)


def model_list(spec: str | list[str] | tuple[str, ...]) -> list[str]:
    """ "gemini-flash-latest, gemini-flash-lite-latest" → both, in order (a fallback chain).

    Free-tier keys have a small daily quota *per model*, so when one model is used up (429) the next
    one still answers.
    """
    items = spec.split(",") if isinstance(spec, str) else list(spec)
    return [m.strip() for m in items if m.strip()]
