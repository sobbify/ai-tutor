from __future__ import annotations

import asyncio
import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ai_tutor.config import Settings
from ai_tutor.db import Database
from ai_tutor.main import create_app
from ai_tutor.models import AdminUser
from ai_tutor.security.passwords import hash_password

ROOT = Path(__file__).resolve().parents[2]
CSRF = {"X-Requested-With": "ai-tutor"}
ADMIN_PASSWORD = "Correct-Horse-9-battery"
# Run the suite against PostgreSQL too: TEST_DATABASE_URL=postgresql+asyncpg://user:pw@host/db pytest
PG_URL = os.environ.get("TEST_DATABASE_URL")


def _reset_postgres(url: str) -> None:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    async def go() -> None:
        engine = create_async_engine(url)
        async with engine.begin() as conn:
            await conn.execute(text("DROP SCHEMA public CASCADE"))
            await conn.execute(text("CREATE SCHEMA public"))
        await engine.dispose()

    asyncio.run(go())


def make_settings(tmp_path: Path, **overrides: object) -> Settings:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html><title>AI Tutor</title><div id=root></div>")
    (dist / "assets" / "app.js").write_text("console.log('hi')")
    (dist / "pcm-recorder-worklet.js").write_text("registerProcessor('pcm-recorder', class {})")
    values: dict[str, object] = {
        "environment": "test",
        "database_url": PG_URL or f"sqlite+aiosqlite:///{(tmp_path / 'test.db').as_posix()}",
        "evaluator": "rules",
        "log_json": False,
        "log_level": "WARNING",
        "frontend_dist": dist,
        "content_file": ROOT / "content" / "moments.json",
        "voice_cache_dir": tmp_path / "voice",
        "reply_rate_per_minute": 1000,
        **overrides,
    }
    return Settings(**values)  # type: ignore[arg-type]


@pytest.fixture(autouse=True)
def _fresh_database() -> None:
    if PG_URL:
        _reset_postgres(PG_URL)


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return make_settings(tmp_path)


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings), base_url="http://testserver") as c:
        yield c


def enter(client: TestClient, uid: str = "teacher-1", name: str = "Priya Sharma", consent: bool = True) -> None:
    r = client.get("/in", params={"uid": uid, "name": name}, follow_redirects=False)
    assert r.status_code == 303, r.text
    if consent:
        r = client.post("/api/tutor/onboarding", json={"consent": True}, headers=CSRF)
        assert r.status_code == 200, r.text


@pytest.fixture
def learner(client: TestClient) -> TestClient:
    enter(client)
    return client


def add_admin(settings: Settings, username: str = "ops", password: str = ADMIN_PASSWORD) -> None:
    async def go() -> None:
        db = Database(settings.database_url)
        async with db.sessionmaker() as s:
            s.add(AdminUser(username=username, password_hash=hash_password(password)))
            await s.commit()
        await db.dispose()

    asyncio.run(go())


@pytest.fixture
def admin(client: TestClient, settings: Settings) -> TestClient:
    add_admin(settings)
    r = client.post("/api/admin/login", json={"username": "ops", "password": ADMIN_PASSWORD}, headers=CSRF)
    assert r.status_code == 200, r.text
    return client


def play_through(
    client: TestClient, moment_id: str, transcripts: dict[int, str] | None = None, quick: bool = False
) -> None:
    run = client.post(f"/api/tutor/moments/{moment_id}/run", json={"quick": quick}, headers=CSRF).json()
    moment = client.get(f"/api/tutor/moments/{moment_id}").json()
    turns = {t["id"]: t for t in moment["turns"]}
    while not run["completed"]:
        i = run["turnIndex"]
        turn = turns[run["turnIds"][i]]
        data = {"turn_id": turn["id"]}
        files = None
        if transcripts and i in transcripts:
            data["transcript"] = transcripts[i]
        else:
            files = {"audio": ("reply.webm", b"fake-audio", "audio/webm")}
        r = client.post(f"/api/tutor/moments/{moment_id}/replies", data=data, files=files, headers=CSRF)
        assert r.status_code == 200, r.text
        run = client.post(f"/api/tutor/moments/{moment_id}/advance", headers=CSRF).json()
