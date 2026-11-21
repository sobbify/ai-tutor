#!/usr/bin/env python3
# ruff: noqa: S603, S607, S605, S310, T201, BLE001, UP036  (a local launcher: fixed commands, console output)
"""One command to run AI Tutor: FastAPI backend (:8000) + React frontend.

  python run.py                 dev: backend (auto-reload) + Vite dev server on :5173, opens the app
  python run.py --prod          build the React app once and serve everything from :8000
  python run.py --create-admin  add a database-console admin (asks for username + password)
  python run.py --setup-env     (re)write backend/.env (Gemini key(s) or the offline evaluator)
  python run.py --no-browser    don't open a browser tab
  python run.py --host 0.0.0.0  reach it from other devices on your network

Learners enter through the host app:   /in?uid=<learner id>&name=<display name>
Database console:                       /admin

First run creates backend/.env, installs missing Python/npm packages, migrates the database and
offers to create the first admin. Ctrl+C stops everything. `python purge.py` undoes the installs.
"""

from __future__ import annotations

import argparse
import contextlib
import getpass
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
ENV = BACKEND / ".env"
IS_WIN = os.name == "nt"
COLORS = {"api": "\033[94m", "web": "\033[95m", "run": "\033[92m", "err": "\033[91m"}
RESET = "\033[0m"
if IS_WIN:
    os.system("")


def say(tag: str, msg: str) -> None:
    print(f"{COLORS.get(tag, '')}[{tag}]{RESET} {msg}", flush=True)


def py_env() -> dict[str, str]:
    return {
        **os.environ,
        "PYTHONPATH": str(BACKEND / "src"),
        "PYTHONUNBUFFERED": "1",
        "FORCE_COLOR": "1",
    }


# ------------------------------------------------------------------ setup
def setup_env(force: bool = False) -> None:
    if ENV.exists() and not force:
        return
    say("run", "Let's create backend/.env (stays on this computer, git-ignored).")
    keys: list[str] = []
    while True:
        k = getpass.getpass(
            f"Paste Gemini key #{len(keys) + 1} (hidden; Enter to finish, or Enter now to use the offline checker): "
        ).strip()
        if not k:
            break
        keys.append(k)
    lines = []
    for line in (BACKEND / ".env.example").read_text(encoding="utf-8").splitlines():
        if line.startswith("GEMINI_API_KEYS="):
            line = "GEMINI_API_KEYS=" + ",".join(keys)
        elif line.startswith("EVALUATOR="):
            line = "EVALUATOR=" + ("gemini" if keys else "rules")
        lines.append(line)
    ENV.write_text("\n".join(lines) + "\n", encoding="utf-8")
    with contextlib.suppress(OSError):
        os.chmod(ENV, 0o600)
    say(
        "run",
        f"Wrote backend/.env ({len(keys)} key(s); evaluator={'gemini' if keys else 'rules (offline)'}).",
    )


def check_versions() -> None:
    if sys.version_info < (3, 10):
        say(
            "err",
            f"Python 3.10+ is needed (this is {sys.version.split()[0]}). Install it from https://python.org",
        )
        sys.exit(1)


def _has_module(name: str) -> bool:
    import importlib.util

    try:
        return importlib.util.find_spec(name) is not None
    except (
        ImportError,
        ValueError,
    ):  # parent package missing, e.g. "google" for "google.genai"
        return False


def ensure_python_deps() -> None:
    needed = (
        "aiosqlite",
        "alembic",
        "dotenv",
        "fastapi",
        "google.genai",
        "multipart",
        "pydantic_settings",
        "sqlalchemy",
        "structlog",
        "uvicorn",
    )
    if not all(_has_module(m) for m in needed):
        say("run", "Installing Python packages (backend/requirements.txt)…")
        subprocess.check_call(
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                "-r",
                str(BACKEND / "requirements.txt"),
            ]
        )


def npm() -> str:
    exe = shutil.which("npm.cmd" if IS_WIN else "npm") or shutil.which("npm")
    if not exe:
        say(
            "err", "npm not found on PATH — install Node.js 22+ from https://nodejs.org"
        )
        sys.exit(1)
    return exe


def ensure_node_deps() -> None:
    out = subprocess.run(
        ["node", "--version"], capture_output=True, text=True, check=False, shell=IS_WIN
    )
    version = out.stdout.strip().lstrip("v").split(".")
    if out.returncode != 0 or not version[0].isdigit():
        say("err", "Node.js not found — install Node.js 22+ from https://nodejs.org")
        sys.exit(1)
    major, minor = (
        int(version[0]),
        int(version[1]) if len(version) > 1 and version[1].isdigit() else 0,
    )
    if (major, minor) < (20, 19):
        say(
            "err",
            f"Node.js 20.19+ is needed (found {out.stdout.strip()}). Install Node.js 22 from https://nodejs.org",
        )
        sys.exit(1)
    if not (ROOT / "node_modules").exists():
        say("run", "Installing frontend packages (npm install)…")
        subprocess.check_call([npm(), "install", "--no-audit", "--no-fund"], cwd=ROOT)


def cli(*args: str, stdin: str | None = None) -> int:
    return subprocess.run(
        [sys.executable, "-m", "ai_tutor", *args],
        cwd=BACKEND,
        env=py_env(),
        input=stdin,
        text=True,
        check=False,
    ).returncode


def admin_count() -> int:
    out = subprocess.run(
        [sys.executable, "-m", "ai_tutor", "admin-count"],
        cwd=BACKEND,
        env=py_env(),
        capture_output=True,
        text=True,
        check=False,
    )
    return int(out.stdout.strip() or 0) if out.returncode == 0 else 0


def create_admin() -> None:
    say("run", "Create a database-console admin.")
    username = input("Admin username: ").strip()
    if username:
        cli("create-admin", username)


def port_free(port: int) -> bool:
    import socket

    with socket.socket() as s:
        return s.connect_ex(("127.0.0.1", port)) != 0


# ------------------------------------------------------------------ processes
def start(
    tag: str, cmd: list[str], cwd: Path, env: dict[str, str]
) -> subprocess.Popen[str]:
    kwargs: dict[str, object] = (
        {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
        if IS_WIN
        else {"start_new_session": True}
    )
    p = subprocess.Popen(
        cmd,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        **kwargs,  # type: ignore[call-overload]
    )

    def pump() -> None:
        assert p.stdout is not None
        for line in p.stdout:
            say(tag, line.rstrip())

    threading.Thread(target=pump, daemon=True).start()
    return p


def stop(p: subprocess.Popen[str]) -> None:
    if p.poll() is not None:
        return
    try:
        if IS_WIN:  # npm spawns node children; kill the whole tree
            subprocess.run(
                ["taskkill", "/PID", str(p.pid), "/T", "/F"],
                capture_output=True,
                check=False,
            )
        else:
            os.killpg(p.pid, signal.SIGTERM)
        p.wait(timeout=5)
    except Exception:
        p.kill()


def wait_for(url: str, timeout: float = 60) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=2):
                return True
        except Exception:
            time.sleep(0.5)
    return False


# ------------------------------------------------------------------ main
def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument(
        "--prod",
        action="store_true",
        help="build the frontend and serve everything from :8000",
    )
    ap.add_argument(
        "--create-admin", action="store_true", help="add a console admin and exit"
    )
    ap.add_argument("--setup-env", action="store_true", help="rewrite backend/.env")
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument(
        "--host", default="127.0.0.1", help="backend host (0.0.0.0 for your LAN)"
    )
    args = ap.parse_args()

    check_versions()
    setup_env(force=args.setup_env)
    ensure_python_deps()
    if cli("migrate") != 0:
        say("err", "Database migration failed — see above.")
        return 1
    if args.create_admin:
        create_admin()
        return 0
    if admin_count() == 0 and sys.stdin.isatty():
        say("run", "No console admin yet.")
        create_admin()
    ensure_node_deps()

    ports = [8000] if args.prod else [8000, 5173]
    if busy := [p for p in ports if not port_free(p)]:
        say(
            "err",
            f"Port(s) {busy} already in use — is AI Tutor already running? Close it first.",
        )
        return 1

    procs: list[subprocess.Popen[str]] = []

    def _graceful(_signum: int, _frame: object) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, _graceful)
    if hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, _graceful)
    try:
        if args.prod:
            say("run", "Building the React app…")
            subprocess.check_call([npm(), "run", "build"], cwd=ROOT)
        uv = [
            sys.executable,
            "-m",
            "uvicorn",
            "ai_tutor.asgi:app",
            "--host",
            args.host,
            "--port",
            "8000",
            "--proxy-headers",
        ]
        if not args.prod:
            uv += ["--reload", "--reload-dir", str(BACKEND / "src")]
        procs.append(start("api", uv, BACKEND, {**py_env(), "AUTO_MIGRATE": "false"}))
        if not args.prod:
            procs.append(
                start(
                    "web",
                    [npm(), "run", "dev", "--", "--host", args.host],
                    ROOT,
                    {**os.environ, "VITE_API_MODE": "http"},
                )
            )

        url = "http://localhost:8000" if args.prod else "http://localhost:5173"
        if not wait_for("http://127.0.0.1:8000/api/health"):
            say("err", "Backend didn't start — see the [api] lines above.")
            return 1
        if not args.prod and not wait_for("http://127.0.0.1:5173/@vite/client"):
            say("err", "Frontend didn't start — see the [web] lines above.")
            return 1
        demo = f"{url}/in?" + urllib.parse.urlencode(
            {"uid": "local-dev", "name": "Priya"}
        )
        say("run", f"✅ AI Tutor is running on {url}   (Ctrl+C to stop)")
        say(
            "run",
            f"Learner entry:     {url}/in?uid=<learner id>&name=<name>   (demo: {demo})",
        )
        say("run", f"Database console:  {url}/admin")
        if not args.no_browser:
            webbrowser.open(demo)

        while all(p.poll() is None for p in procs):
            time.sleep(0.5)
        say("err", "A server exited — stopping the other one.")
        return 1
    except KeyboardInterrupt:
        say("run", "Stopping…")
        return 0
    finally:
        for p in procs:
            stop(p)


if __name__ == "__main__":
    sys.exit(main())
