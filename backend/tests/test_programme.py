"""The ELSA MVP features: programme days, streak, hidden levels, onboarding, baseline, phrasebook,
"Tell me what happened", certificate, transcripts-only storage, delete my data and the nudge feed."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Iterator
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from ai_tutor.config import Settings
from ai_tutor.db import Database
from ai_tutor.main import create_app
from ai_tutor.models import Learner, LearnerProfile, PracticeDay
from ai_tutor.services import programme as prog
from ai_tutor.services.learner import due_nudges

from .conftest import CSRF, enter, play_through
from .test_realtime_audio import FakeSynth

MON = date(2026, 11, 16)  # a Monday


# ---- pure rules ---------------------------------------------------------------------------------


def test_programme_day_and_week() -> None:
    s = prog.programme_state([], MON, programme_done=False)
    assert (s.day, s.week, s.harder_today, s.complete) == (1, 1, False, False)
    four = [MON + timedelta(days=i) for i in range(4)]
    s = prog.programme_state(four, MON + timedelta(days=7), programme_done=False)
    assert (s.day, s.week, s.harder_today) == (5, 1, True)  # missed days never delay her
    s = prog.programme_state([*four, MON + timedelta(days=4)], MON + timedelta(days=4), programme_done=False)
    assert (s.day, s.practised_today, s.harder_today) == (5, True, True)
    fifteen = [MON + timedelta(days=i) for i in range(15)]
    s = prog.programme_state(fifteen, MON + timedelta(days=20), programme_done=True)
    assert (s.day, s.week, s.complete) == (15, 3, True)
    assert prog.programme_state(fifteen, MON + timedelta(days=20), programme_done=False).complete is False


def test_streak_counts_school_days_with_one_free_miss() -> None:
    week = [MON + timedelta(days=i) for i in range(5)]  # Mon–Fri
    assert prog.streak(week, MON + timedelta(days=7), set()) == 5  # weekend skipped, today not yet practised
    missed_one = [d for d in week if d.weekday() != 2]
    assert prog.streak(missed_one, MON + timedelta(days=4), set()) == 4  # one free miss a week
    missed_two = [d for d in week if d.weekday() not in (1, 2)]
    assert prog.streak(missed_two, MON + timedelta(days=4), set()) == 2
    assert prog.streak(missed_two, MON + timedelta(days=4), {MON + timedelta(days=1)}) == 3  # holiday
    assert prog.streak([], MON, set()) == 0


# ---- helpers ------------------------------------------------------------------------------------


def run_db(settings: Settings, fn) -> object:  # type: ignore[no-untyped-def]
    async def go() -> object:
        db = Database(settings.database_url)
        async with db.sessionmaker() as s:
            out = await fn(s)
            await s.commit()
        await db.dispose()
        return out

    return asyncio.run(go())


def add_days(settings: Settings, uid: str, days: list[date]) -> None:
    async def fn(s):  # type: ignore[no-untyped-def]
        learner = await s.scalar(select(Learner).where(Learner.uid == uid))
        for d in days:
            s.add(PracticeDay(learner_id=learner.id, day=d))

    run_db(settings, fn)


def past_days(n: int) -> list[date]:
    today = prog.local_today("Asia/Kolkata")
    return [today - timedelta(days=i + 1) for i in range(n)]


@pytest.fixture
def app_client(settings: Settings) -> Iterator[TestClient]:
    with TestClient(create_app(settings, audio=(FakeSynth(), None)), base_url="http://testserver") as c:
        yield c


# ---- home, onboarding, baseline -------------------------------------------------------------------


def test_onboarding_home_and_baseline(app_client: TestClient, settings: Settings) -> None:
    c = app_client
    enter(c, consent=False)
    home = c.get("/api/tutor/home").json()
    assert home["consented"] is False and home["baselineDone"] is False
    r = c.post(
        "/api/tutor/onboarding",
        json={"consent": True, "hardestMomentId": "upset-parent"},
        headers=CSRF,
    )
    assert r.json() == {
        "quietMode": False,
        "nudgeTime": None,
        "hardestMomentId": "upset-parent",
        "consented": True,
    }
    bad = c.post("/api/tutor/onboarding", json={"consent": True, "hardestMomentId": "phone-call"}, headers=CSRF)
    assert bad.status_code == 422  # only programme moments

    home = c.get("/api/tutor/home").json()
    assert home["programme"] == {
        "day": 1,
        "totalDays": 15,
        "week": 1,
        "weekTitle": "Drop-off and pick-up",
        "daysPractised": 0,
        "practisedToday": False,
        "harderToday": False,
        "complete": False,
    }
    # Her hardest moment comes first, and is open even though it's week 3.
    assert home["recommended"] == {"momentId": "upset-parent", "title": "Worried or Upset Parent", "reason": "hardest"}
    assert c.post("/api/tutor/moments/upset-parent/run", json={}, headers=CSRF).status_code == 200

    # The friendly first chat: never a practice day, never shown as progress, but it sets the hidden level.
    play_through(c, "hello-elsa")
    home = c.get("/api/tutor/home").json()
    assert home["baselineDone"] is True and home["programme"]["daysPractised"] == 0
    profile = run_db(settings, lambda s: s.get(LearnerProfile, 1))
    assert profile is not None and 1 <= profile.band <= 4  # type: ignore[attr-defined]
    text = json.dumps([home, c.get("/api/tutor/progress").json()])
    assert '"band"' not in text and '"level"' not in text  # never displayed


def test_day_five_is_harder_and_suggests_a_story(app_client: TestClient, settings: Settings) -> None:
    enter(app_client)
    add_days(settings, "teacher-1", past_days(4))
    home = app_client.get("/api/tutor/home").json()
    assert home["programme"]["day"] == 5 and home["programme"]["harderToday"] is True
    assert home["storySuggested"] is True and home["recommended"]["reason"] == "harder"
    run = app_client.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF).json()
    assert "mg-allergy" in run["turnIds"]  # a surprise follow-up on day 5
    quick = app_client.post("/api/tutor/moments/phone-call/run", json={"quick": True}, headers=CSRF).json()
    assert len(quick["turnIds"]) == 3
    app_client.post("/api/tutor/stories", json={"text": "Today a parent asked me about the trip."}, headers=CSRF)
    assert app_client.get("/api/tutor/home").json()["storySuggested"] is False


def test_week_two_opens_on_day_six(app_client: TestClient, settings: Settings) -> None:
    enter(app_client)
    add_days(settings, "teacher-1", past_days(5))
    status = {m["id"]: m["status"] for m in app_client.get("/api/tutor/progress").json()["moments"]}
    assert status["parent-meeting"] == "available" and status["upset-parent"] == "locked"


def test_preferences(app_client: TestClient) -> None:
    enter(app_client)
    r = app_client.put("/api/tutor/preferences", json={"quietMode": True, "nudgeTime": "13:30"}, headers=CSRF)
    assert r.json()["quietMode"] is True and r.json()["nudgeTime"] == "13:30"
    assert app_client.put("/api/tutor/preferences", json={"nudgeTime": "25:00"}, headers=CSRF).status_code == 422
    r = app_client.put("/api/tutor/preferences", json={"clearNudge": True}, headers=CSRF)
    assert r.json()["nudgeTime"] is None


# ---- phrasebook -----------------------------------------------------------------------------------


def test_phrasebook_saves_only_practice_lines(app_client: TestClient) -> None:
    enter(app_client)
    moment = app_client.get("/api/tutor/moments/morning-greeting").json()
    lesson_line = moment["lesson"]["phrases"][0]["text"]
    r = app_client.post(
        "/api/tutor/phrasebook", json={"text": lesson_line, "momentId": "morning-greeting"}, headers=CSRF
    )
    assert r.status_code == 201 and r.json()["source"] == "lesson"
    again = app_client.post("/api/tutor/phrasebook", json={"text": lesson_line}, headers=CSRF)
    assert again.json()["id"] == r.json()["id"]  # saving twice is harmless
    assert app_client.post("/api/tutor/phrasebook", json={"text": "Anything at all"}, headers=CSRF).status_code == 404
    entries = app_client.get("/api/tutor/phrasebook").json()
    assert [e["text"] for e in entries] == [lesson_line]
    voice = app_client.get(f"/api/tutor/phrasebook/{entries[0]['id']}/voice")
    assert voice.status_code == 200 and "immutable" in voice.headers["cache-control"]  # kept offline
    assert app_client.delete(f"/api/tutor/phrasebook/{entries[0]['id']}", headers=CSRF).status_code == 204
    assert app_client.get("/api/tutor/phrasebook").json() == []
    enter(app_client, "other", "Other Teacher")
    assert app_client.get(f"/api/tutor/phrasebook/{entries[0]['id']}/voice").status_code == 404


# ---- "Tell me what happened" ----------------------------------------------------------------------


def test_story_removes_names_coaches_and_counts_as_practice(app_client: TestClient) -> None:
    enter(app_client)
    story = app_client.post(
        "/api/tutor/stories",
        json={"text": "A boy named Rohan cried and his mother asked me. I said he eat well and is happy."},
        headers=CSRF,
    ).json()
    assert story["heard"] is True and "Rohan" not in story["transcript"]
    assert story["fix"]["wrong"] == "he eat" and story["tip"] and story["betterLine"]
    saved = app_client.post("/api/tutor/phrasebook", json={"text": story["betterLine"]}, headers=CSRF)
    assert saved.json()["source"] == "story"
    assert app_client.get("/api/tutor/home").json()["programme"]["daysPractised"] == 1
    assert len(app_client.get("/api/tutor/stories").json()) == 1
    assert app_client.delete(f"/api/tutor/stories/{story['id']}", headers=CSRF).status_code == 204
    assert app_client.get("/api/tutor/stories").json() == []
    short = app_client.post("/api/tutor/stories", json={"text": "um yes"}, headers=CSRF).json()
    assert short["heard"] is False and short["id"] is None


def test_story_socket(app_client: TestClient) -> None:
    enter(app_client)
    with app_client.websocket_connect("/ws/story", headers={"origin": "http://testserver"}) as ws:
        ws.send_text(json.dumps({"type": "start"}))
        assert ws.receive_json() == {"type": "ready", "live": False}
        ws.send_bytes(b"\x10\x00" * 640)
        ws.send_text(json.dumps({"type": "stop"}))
        msg = ws.receive_json()
    assert msg["type"] == "story" and msg["story"]["heard"] is True and msg["story"]["id"]


# ---- certificate ----------------------------------------------------------------------------------


def test_certificate_after_fifteen_days_and_every_moment(app_client: TestClient, settings: Settings) -> None:
    enter(app_client)
    cert = app_client.get("/api/tutor/certificate").json()
    assert cert["earned"] is False and cert["daysNeeded"] == 15 and len(cert["momentsLeft"]) == 4
    add_days(settings, "teacher-1", past_days(15))
    for m in ("morning-greeting", "pickup-update", "parent-meeting", "upset-parent"):
        play_through(app_client, m)
    cert = app_client.get("/api/tutor/certificate").json()
    assert cert["earned"] is True and cert["name"] == "Priya Sharma" and cert["momentsLeft"] == []
    assert app_client.get("/api/tutor/home").json()["certificateEarned"] is True


# ---- recordings & delete my data ------------------------------------------------------------------


def test_audio_is_never_stored_only_the_transcript(app_client: TestClient, settings: Settings) -> None:
    from sqlalchemy import inspect

    enter(app_client)
    app_client.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF)
    audio = b"RIFF-fake-wav-bytes"
    r = app_client.post(
        "/api/tutor/moments/morning-greeting/replies",
        data={"turn_id": "mg-1"},
        files={"audio": ("r.wav", audio, "audio/wav")},
        headers=CSRF,
    ).json()
    assert r["feedback"]["heard"] and "hasRecording" not in r
    assert app_client.get(f"/api/tutor/replies/{r['id']}/recording").status_code in (403, 404)

    async def tables(s):  # type: ignore[no-untyped-def]
        conn = await s.connection()
        return await conn.run_sync(lambda c: inspect(c).get_table_names())

    assert "recordings" not in run_db(settings, tables)  # type: ignore[operator]
    files = Path(settings.voice_cache_dir).parent.rglob("*")  # the test's whole data folder
    assert not [f for f in files if f.suffix in (".wav", ".bin", ".webm") and "voice" not in f.parts]


def test_delete_my_data(app_client: TestClient) -> None:
    enter(app_client)
    play_through(app_client, "morning-greeting")
    app_client.post("/api/tutor/stories", json={"text": "A parent asked me about lunch today."}, headers=CSRF)
    assert app_client.delete("/api/tutor/me/data", headers=CSRF).status_code == 204
    progress = app_client.get("/api/tutor/progress").json()
    assert all(m["timesPractised"] == 0 for m in progress["moments"]) and progress["trends"]["daysPractised"] == 0
    assert app_client.get("/api/tutor/stories").json() == []
    assert app_client.get("/api/tutor/preferences").json()["consented"] is True  # not asked again


# ---- nudges for the host app ----------------------------------------------------------------------


def test_nudge_feed_rules(app_client: TestClient, settings: Settings) -> None:
    enter(app_client)
    app_client.put("/api/tutor/preferences", json={"nudgeTime": "13:30"}, headers=CSRF)
    ist = timezone(timedelta(hours=5, minutes=30))

    def due(local: datetime) -> list[dict[str, str]]:
        return run_db(settings, lambda s: due_nudges(s, "Asia/Kolkata", local.astimezone(timezone.utc)))  # type: ignore[return-value]

    assert due(datetime(2026, 11, 18, 13, 0, tzinfo=ist)) == []  # before her time
    first = due(datetime(2026, 11, 18, 13, 45, tzinfo=ist))
    assert [n["uid"] for n in first] == ["teacher-1"] and "miss" not in first[0]["message"].lower()
    assert due(datetime(2026, 11, 18, 15, 0, tzinfo=ist)) == []  # once a day
    assert due(datetime(2026, 11, 21, 14, 0, tzinfo=ist)) == []  # Saturday
    assert due(datetime(2026, 11, 19, 20, 30, tzinfo=ist)) == []  # never after 8 pm


def test_nudge_endpoint_needs_the_host_key(tmp_path: Path) -> None:
    from .conftest import make_settings

    with TestClient(create_app(make_settings(tmp_path / "a"))) as c:
        assert c.get("/api/host/nudges").status_code == 404  # off without a key
    with TestClient(create_app(make_settings(tmp_path / "b", host_api_key="k" * 32))) as c:
        assert c.get("/api/host/nudges", headers={"Authorization": "Bearer wrong"}).status_code == 401
        ok = c.get("/api/host/nudges", headers={"Authorization": f"Bearer {'k' * 32}"})
        assert ok.status_code == 200 and "nudges" in ok.json()


def test_admin_nudge_settings(admin: TestClient) -> None:
    r = admin.put(
        "/api/admin/nudge-settings",
        json={"encouragement": "Great week, everyone!", "holidays": ["2026-11-24"]},
        headers=CSRF,
    )
    assert r.json() == {"encouragement": "Great week, everyone!", "holidays": ["2026-11-24"]}
    assert admin.get("/api/admin/audit").json()["items"][0]["action"] == "nudges.updated"
