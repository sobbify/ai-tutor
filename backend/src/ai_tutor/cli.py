"""Operator commands.

ai-tutor create-admin <username>        (prompts for the password)
ai-tutor reset-admin-password <username>
ai-tutor seed-content [--file PATH]     (loads moments.json if the moments table is empty)
ai-tutor serve [--host H] [--port P]
ai-tutor audio-check [--save FILE.wav]  (realtime voice + listening against real Gemini Live)
ai-tutor make-link <uid> <name> [--centre C] [--base URL]   (a signed /in link, for testing)
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys
from pathlib import Path
from urllib.parse import urlencode

from sqlalchemy import func, select

from .config import get_settings
from .db import Database
from .migrate import upgrade_to_head
from .models import AdminUser
from .security.links import signed_entry_url
from .security.passwords import hash_password, password_problem
from .services.content import seed_if_empty


def _ask_password() -> str:
    while True:
        pw = getpass.getpass("Password (12+ chars, upper + lower + digit): ")
        if problem := password_problem(pw):
            print(problem)
            continue
        if getpass.getpass("Repeat password: ") != pw:
            print("Passwords don't match.")
            continue
        return pw


async def _create_admin(username: str, password: str, reset: bool) -> int:
    settings = get_settings()
    await asyncio.to_thread(upgrade_to_head, settings.database_url)
    db = Database(settings.database_url)
    async with db.sessionmaker() as s:
        existing = await s.scalar(select(AdminUser).where(func.lower(AdminUser.username) == username.lower()))
        if existing and not reset:
            print(f"Admin '{username}' already exists. Use reset-admin-password.")
            return 1
        if not existing and reset:
            print(f"No admin called '{username}'.")
            return 1
        if existing:
            existing.password_hash, existing.failed_logins, existing.locked_until = hash_password(password), 0, None
        else:
            s.add(AdminUser(username=username, password_hash=hash_password(password)))
        await s.commit()
    await db.dispose()
    print(f"Admin '{username}' {'updated' if reset else 'created'}. Sign in at /admin.")
    return 0


async def _admin_count() -> int:
    db = Database(get_settings().database_url)
    async with db.sessionmaker() as s:
        print(await s.scalar(select(func.count()).select_from(AdminUser)))
    await db.dispose()
    return 0


async def _seed(path: Path) -> int:
    settings = get_settings()
    await asyncio.to_thread(upgrade_to_head, settings.database_url)
    db = Database(settings.database_url)
    async with db.sessionmaker() as s:
        n = await seed_if_empty(s, path)
        await s.commit()
    await db.dispose()
    print(f"Seeded {n} moments." if n else "Moments already present; nothing to do.")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="ai-tutor", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("create-admin", "reset-admin-password"):
        p = sub.add_parser(name)
        p.add_argument("username")
        p.add_argument("--password-stdin", action="store_true", help="read the password from stdin (automation)")
    sub.add_parser("migrate")
    sub.add_parser("admin-count")
    p = sub.add_parser("seed-content")
    p.add_argument("--file", type=Path, default=None)
    p = sub.add_parser("serve")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p = sub.add_parser("audio-check")
    p.add_argument("--save", type=Path, default=None, help="also write the synthesised line to this WAV file")
    p = sub.add_parser("make-link", help="print a signed /in link (valid for a few minutes)")
    p.add_argument("uid")
    p.add_argument("name")
    p.add_argument("--centre", default=None)
    p.add_argument("--base", default="http://localhost:8000")
    args = ap.parse_args(argv)

    if args.cmd in ("create-admin", "reset-admin-password"):
        pw = sys.stdin.readline().rstrip("\n") if args.password_stdin else _ask_password()
        if problem := password_problem(pw):
            print(problem)
            return 1
        return asyncio.run(_create_admin(args.username, pw, reset=args.cmd == "reset-admin-password"))
    if args.cmd == "migrate":
        from .migrate import upgrade_to_head

        upgrade_to_head(get_settings().database_url)
        return 0
    if args.cmd == "make-link":
        settings = get_settings()
        if not settings.entry_link_secret:
            query = urlencode({"uid": args.uid, "name": args.name, **({"centre": args.centre} if args.centre else {})})
            print(f"{args.base.rstrip('/')}/in?{query}")
            print("(unsigned: ENTRY_LINK_SECRET is not set, so this works in development only)", file=sys.stderr)
            return 0
        print(signed_entry_url(args.base, settings.entry_link_secret, args.uid, args.name, args.centre))
        return 0
    if args.cmd == "admin-count":
        return asyncio.run(_admin_count())
    if args.cmd == "seed-content":
        return asyncio.run(_seed(args.file or get_settings().content_file))
    if args.cmd == "audio-check":
        from .services.audio_check import run

        return asyncio.run(run(get_settings(), save=args.save))
    if args.cmd == "serve":
        import uvicorn

        uvicorn.run("ai_tutor.asgi:app", host=args.host, port=args.port, proxy_headers=True, forwarded_allow_ips="*")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
