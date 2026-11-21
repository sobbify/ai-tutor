#!/usr/bin/env python3
# ruff: noqa: S603, T201, BLE001  (a local clean-up tool: fixed commands, console output)
"""Remove everything that was installed or generated inside this project folder.

  python purge.py            show what will be removed, ask, then remove it
  python purge.py --yes      no question
  python purge.py --dry-run  only show what would be removed

Removed by default (all re-created by `python run.py`):
  node_modules, dist, Vite cache, test reports, __pycache__ / *.pyc, pytest/mypy/ruff caches,
  .venv folders, build/egg-info leftovers

Kept by default: your source code, package-lock.json, backend/.env (your keys) and the
database in backend/data/ (every learner's progress).

Extra options:
  --env     also delete backend/.env (your Gemini keys and settings)
  --db      also delete the database in backend/data/ — all learners, replies, admins and content
            edits. Download a backup in the console first (/admin → Settings) if you might need it.
  --pip     also uninstall the Python packages run.py installed (from backend/requirements.txt)
            from the Python running this script. They live outside this folder and other projects
            may use them, so this is opt-in.
  --all     --env + --db + --pip
"""

from __future__ import annotations

import argparse
import contextlib
import os
import shutil
import socket
import stat
import subprocess
import sys
from importlib import metadata
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"

# Generated folders at fixed places.
FIXED_TARGETS = [
    "node_modules",
    "dist",
    ".vite",
    "test-results",
    "playwright-report",
    "coverage",
    ".venv",
    "venv",
    "backend/.venv",
    "backend/venv",
    "backend/build",
]
# Generated folders found anywhere in the tree.
NAMED_DIRS = {"__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache"}
SKIP_DIRS = {
    "node_modules",
    ".git",
    ".venv",
    "venv",
}  # never walk into these while searching

# What run.py installs (backend/requirements.txt). pydantic is left alone: too widely shared.
PIP_PACKAGES = [
    "fastapi",
    "uvicorn",
    "sqlalchemy",
    "aiosqlite",
    "alembic",
    "pydantic-settings",
    "python-dotenv",
    "python-multipart",
    "structlog",
    "google-genai",
    "asyncpg",
]


def inside_root(p: Path) -> bool:
    try:
        p.resolve().relative_to(ROOT)
        return True
    except ValueError:
        return False


def size_of(p: Path) -> int:
    if p.is_file() or p.is_symlink():
        return p.lstat().st_size
    total = 0
    for dirpath, _, files in os.walk(p):
        for f in files:
            with contextlib.suppress(OSError):
                total += (Path(dirpath) / f).lstat().st_size
    return total


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def find_targets(include_env: bool, include_db: bool) -> list[Path]:
    targets = [ROOT / t for t in FIXED_TARGETS]
    targets += list(BACKEND.glob("src/*.egg-info")) + list(BACKEND.glob("*.egg-info"))
    for dirpath, dirnames, files in os.walk(ROOT):
        here = Path(dirpath)
        if here.name in NAMED_DIRS:
            targets.append(here)
            dirnames[:] = []
            continue
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        targets += [here / f for f in files if f.endswith((".pyc", ".pyo"))]
    if include_env:
        targets.append(BACKEND / ".env")
    if include_db:
        targets.append(BACKEND / "data")
    seen: set[Path] = set()
    out: list[Path] = []
    for t in targets:
        if t.exists() and inside_root(t) and t.resolve() != ROOT and t not in seen:
            # Skip anything already covered by a parent folder in the list.
            if any(parent in seen for parent in t.parents):
                continue
            seen.add(t)
            out.append(t)
    return out


def _force_writable(func: Any, path: str, _exc: Any) -> None:
    """Windows: node_modules often contains read-only files."""
    os.chmod(path, stat.S_IWRITE)
    func(path)


def remove(p: Path) -> None:
    if p.is_dir() and not p.is_symlink():
        if sys.version_info >= (3, 12):
            shutil.rmtree(p, onexc=_force_writable)
        else:
            shutil.rmtree(p, onerror=_force_writable)
    else:
        p.unlink()


def servers_running() -> list[int]:
    busy = []
    for port in (8000, 5173):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                busy.append(port)
    return busy


def installed_pip_packages() -> list[str]:
    found = []
    for name in PIP_PACKAGES:
        with contextlib.suppress(metadata.PackageNotFoundError):
            found.append(f"{name}=={metadata.version(name)}")
    return found


def note_for(t: Path) -> str:
    if t == BACKEND / ".env":
        return "   ← your API keys and settings!"
    if t == BACKEND / "data":
        return "   ← the DATABASE: all learners, replies, admins!"
    return ""


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument(
        "--yes", "-y", action="store_true", help="don't ask for confirmation"
    )
    ap.add_argument(
        "--dry-run", action="store_true", help="only list what would be removed"
    )
    ap.add_argument(
        "--env", action="store_true", help="also delete backend/.env (your keys)"
    )
    ap.add_argument(
        "--db", action="store_true", help="also delete the database in backend/data/"
    )
    ap.add_argument(
        "--pip", action="store_true", help="also pip-uninstall the backend packages"
    )
    ap.add_argument("--all", action="store_true", help="same as --env --db --pip")
    args = ap.parse_args()
    if args.all:
        args.env = args.db = args.pip = True

    busy = servers_running()
    if busy and not args.dry_run:
        print(
            f"⚠  Something is running on port(s) {busy} — stop `python run.py` first (Ctrl+C),"
        )
        print(
            "   otherwise Windows may refuse to delete files that are in use (the database especially)."
        )
        if not args.yes and input("Continue anyway? [y/N] ").strip().lower() != "y":
            return 1

    targets = find_targets(args.env, args.db)
    pip_pkgs = installed_pip_packages() if args.pip else []

    if not targets and not pip_pkgs:
        print("Nothing to purge — the folder is already clean.")
        return 0

    total = 0
    print(f"Project folder: {ROOT}\n")
    if targets:
        print("Will delete:")
        for t in targets:
            n = size_of(t)
            total += n
            print(
                f"  {t.relative_to(ROOT)}{os.sep if t.is_dir() else ''}  ({human(n)}){note_for(t)}"
            )
        print(f"  total ≈ {human(total)}")
    if pip_pkgs:
        print(f"\nWill pip-uninstall from {sys.executable}:")
        for p in pip_pkgs:
            print(f"  {p}")
        print(
            "  (their own dependencies are left in place; other projects may share them)"
        )
    kept = ["source code", "package-lock.json"]
    if not args.env:
        kept.append("backend/.env (your keys)")
    if not args.db:
        kept.append("backend/data/ (the database)")
    print("\nKept: " + ", ".join(kept))

    if args.dry_run:
        print("\nDry run — nothing removed.")
        return 0
    if not args.yes:
        if input("\nProceed? [y/N] ").strip().lower() != "y":
            print("Cancelled.")
            return 1
        if (
            args.db
            and (BACKEND / "data").exists()
            and input("Really delete the DATABASE? Type 'delete' to confirm: ").strip()
            != "delete"
        ):
            print("Cancelled — nothing removed.")
            return 1

    failed: list[Path] = []
    for t in targets:
        try:
            remove(t)
            print(f"  removed {t.relative_to(ROOT)}")
        except Exception as e:
            failed.append(t)
            print(f"  ✗ could not remove {t.relative_to(ROOT)}: {e}")
    if pip_pkgs:
        names = [p.split("==")[0] for p in pip_pkgs]
        rc = subprocess.call([sys.executable, "-m", "pip", "uninstall", "-y", *names])
        if rc != 0:
            print("  ✗ pip uninstall reported an error (see above)")
            failed.append(Path("pip"))

    if failed:
        print(
            "\nDone with errors — close any editor/terminal/server using those files and run purge.py again."
        )
        return 1
    print(
        f"\n✅ Purged ≈ {human(total)}. Run `python run.py` to set everything up again."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
