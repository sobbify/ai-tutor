"""Admin password hashing with scrypt (stdlib, memory-hard). Format: scrypt$n$r$p$salt_hex$hash_hex"""

from __future__ import annotations

import hashlib
import hmac
import secrets

N, R, P, DKLEN = 2**15, 8, 1, 32
MAXMEM = 64 * 1024 * 1024


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=N, r=R, p=P, dklen=DKLEN, maxmem=MAXMEM)
    return f"scrypt${N}${R}${P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_hex, hash_hex = stored.split("$")
        if algo != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(hash_hex) // 2,
            maxmem=MAXMEM,
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), hash_hex)


def password_problem(password: str) -> str | None:
    if len(password) < 12:
        return "Use at least 12 characters."
    if password.lower() == password or password.upper() == password or not any(c.isdigit() for c in password):
        return "Mix upper- and lower-case letters and at least one digit."
    return None
