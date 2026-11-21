"""In-process sliding-window rate limiter (the app runs as a single worker, like the Live tutor)."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, limit: int, window_seconds: float = 60) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            if len(self._hits) > 10_000:  # bound memory
                for k in [k for k, v in self._hits.items() if not v][:5_000]:
                    del self._hits[k]
            return True

    def retry_after(self, key: str) -> int:
        hits = self._hits.get(key)
        if not hits:
            return 0
        return max(1, int(self.window - (time.monotonic() - hits[0])) + 1)
