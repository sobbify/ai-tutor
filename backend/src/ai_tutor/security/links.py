"""Signed entry links from the host app (Buddy's World).

The host signs what it sends with a shared secret, so nobody can open ELSA as another teacher by
editing the URL:

    message = f"{uid}\\n{name}\\n{centre or ''}\\n{ts}"        (UTF-8; ts = Unix time in seconds)
    sig     = hex(HMAC-SHA256(ENTRY_LINK_SECRET, message))
    /in?uid=…&name=…&centre=…&ts=…&sig=…

A link is good for a few minutes (clocks may drift a little either way).
"""

from __future__ import annotations

import hashlib
import hmac
import time
from urllib.parse import urlencode

CLOCK_SKEW_SECONDS = 60


def entry_message(uid: str, name: str, centre: str | None, ts: int) -> bytes:
    return f"{uid}\n{name}\n{centre or ''}\n{ts}".encode()


def sign_entry(secret: str, uid: str, name: str, centre: str | None, ts: int) -> str:
    return hmac.new(secret.encode(), entry_message(uid, name, centre, ts), hashlib.sha256).hexdigest()


def entry_problem(
    secret: str,
    uid: str,
    name: str,
    centre: str | None,
    ts: str | None,
    sig: str | None,
    *,
    max_age: int,
    now: float | None = None,
) -> str | None:
    """Why a link can't be trusted ("missing", "malformed", "expired", "bad_signature"), or None."""
    if not ts or not sig:
        return "missing"
    if not ts.isdigit() or len(ts) > 12 or len(sig) != 64:
        return "malformed"
    stamp = int(ts)
    current = time.time() if now is None else now
    if stamp > current + CLOCK_SKEW_SECONDS or current - stamp > max_age:
        return "expired"
    expected = sign_entry(secret, uid, name, centre, stamp)
    if not hmac.compare_digest(expected, sig.lower()):
        return "bad_signature"
    return None


def signed_entry_url(base: str, secret: str, uid: str, name: str, centre: str | None, ts: int | None = None) -> str:
    stamp = int(time.time()) if ts is None else ts
    params = {"uid": uid, "name": name}
    if centre:
        params["centre"] = centre
    params["ts"] = str(stamp)
    params["sig"] = sign_entry(secret, uid, name, centre, stamp)
    return f"{base.rstrip('/')}/in?{urlencode(params)}"
