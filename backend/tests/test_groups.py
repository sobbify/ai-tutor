"""Snowflakes (effort XP) and practice groups: same centre, up to 5, named, leave any time."""

from __future__ import annotations

import asyncio
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlalchemy import update

from ai_tutor.config import Settings
from ai_tutor.db import Database, utcnow
from ai_tutor.models import Learner
from ai_tutor.services import snowflakes as sf

from .conftest import CSRF, play_through


def enter(client: TestClient, uid: str, name: str, centre: str | None = "EK-PUNE-01") -> None:
    params = {"uid": uid, "name": name, **({"centre": centre} if centre else {})}
    assert client.get("/in", params=params, follow_redirects=False).status_code == 303
    assert client.post("/api/tutor/onboarding", json={"consent": True}, headers=CSRF).status_code == 200


def group(client: TestClient) -> dict:  # type: ignore[type-arg]
    r = client.get("/api/tutor/group")
    assert r.status_code == 200, r.text
    return r.json()  # type: ignore[no-any-return]


def make_old(settings: Settings, uid: str, days: int) -> None:
    async def go() -> None:
        db = Database(settings.database_url)
        async with db.sessionmaker() as s:
            await s.execute(
                update(Learner).where(Learner.uid == uid).values(created_at=utcnow() - timedelta(days=days))
            )
            await s.commit()
        await db.dispose()

    asyncio.run(go())


def test_snowflakes_count_effort_not_accuracy(client: TestClient) -> None:
    enter(client, "asha", "Asha Rao")
    assert client.get("/api/tutor/home").json()["snowflakes"] == {"total": 0, "week": 0}

    play_through(client, "hello-elsa")
    summary = client.get("/api/tutor/moments/hello-elsa/summary").json()
    assert summary["snowflakes"]["items"] == [{"kind": "finished", "amount": sf.FINISHED}]
    assert summary["snowflakes"]["earned"] == sf.FINISHED
    # The first chat isn't a programme day, so no daily bonus yet.
    assert summary["snowflakes"]["week"] == sf.FINISHED

    # "Say it again" earns a little more; a wrong answer earns exactly the same as a right one.
    run = client.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF).json()
    turn = run["turnIds"][0]
    for text in ("i am fine", "I'm fine, thank you."):
        r = client.post(
            "/api/tutor/moments/morning-greeting/replies", data={"turn_id": turn, "transcript": text}, headers=CSRF
        )
        assert r.status_code == 200, r.text
    play_through(client, "morning-greeting")  # answers line 1 a third time, then the rest
    summary = client.get("/api/tutor/moments/morning-greeting/summary").json()
    assert summary["snowflakes"]["items"] == [
        {"kind": "finished", "amount": sf.FINISHED},
        {"kind": "again", "amount": 2 * sf.AGAIN},
    ]
    # Her first programme practice today adds the daily bonus to her week.
    assert summary["snowflakes"]["week"] == sf.FINISHED * 2 + 2 * sf.AGAIN + sf.DAILY

    r = client.post(
        "/api/tutor/stories", json={"text": "A mother asked about the picnic and I explained."}, headers=CSRF
    )
    assert r.json()["snowflakes"] == sf.STORY

    expected = sf.FINISHED * 2 + 2 * sf.AGAIN + sf.STORY + sf.DAILY
    assert client.get("/api/tutor/home").json()["snowflakes"] == {"total": expected, "week": expected}

    # Deleting her data resets them.
    assert client.delete("/api/tutor/me/data", headers=CSRF).status_code == 204
    assert client.get("/api/tutor/home").json()["snowflakes"] == {"total": 0, "week": 0}


def test_create_join_and_see_each_other_by_name(client: TestClient) -> None:
    enter(client, "asha", "Asha Rao")
    assert group(client) == {"group": None, "canJoin": True}
    r = client.post("/api/tutor/group", json={"name": "  Sunflower   Room "}, headers=CSRF)
    assert r.status_code == 201, r.text
    g = r.json()["group"]
    assert g["name"] == "Sunflower Room" and g["createdByMe"] and g["maxMembers"] == 5
    assert len(g["code"]) == 6 and g["weekGoal"] == 50
    code = g["code"]
    play_through(client, "morning-greeting")

    enter(client, "meera", "Meera Iyer")
    r = client.post("/api/tutor/group/join", json={"code": f" {code.lower()[:3]}-{code.lower()[3:]} "}, headers=CSRF)
    assert r.status_code == 200, r.text
    g = r.json()["group"]
    assert not g["createdByMe"] and g["weekGoal"] == 100
    # Named, ordered by this week's snowflakes; nothing about feedback, transcripts or levels.
    assert [(m["name"], m["isMe"], m["practisedToday"]) for m in g["members"]] == [
        ("Asha Rao", False, True),
        ("Meera Iyer", True, False),
    ]
    assert g["members"][0]["weekSnowflakes"] == sf.FINISHED + sf.DAILY
    assert set(g["members"][0]) == {"name", "firstName", "isMe", "weekSnowflakes", "practisedToday"}
    assert g["weekTotal"] == sf.FINISHED + sf.DAILY

    home = client.get("/api/tutor/home").json()
    assert home["group"] == {"name": "Sunflower Room", "members": 2, "weekTotal": g["weekTotal"], "weekGoal": 100}
    assert home["groupInvite"] is False

    # Joining again is harmless; a second group isn't allowed.
    assert client.post("/api/tutor/group/join", json={"code": code}, headers=CSRF).status_code == 200
    assert client.post("/api/tutor/group", json={"name": "Another"}, headers=CSRF).status_code == 409


def test_only_same_centre_up_to_five(client: TestClient) -> None:
    enter(client, "t0", "Teacher Zero")
    code = client.post("/api/tutor/group", json={"name": "Daisies"}, headers=CSRF).json()["group"]["code"]

    enter(client, "other", "Other Centre", centre="EK-DELHI-07")
    r = client.post("/api/tutor/group/join", json={"code": code}, headers=CSRF)
    assert r.status_code == 409 and "another centre" in r.json()["detail"]

    enter(client, "nocentre", "No Centre", centre=None)
    assert group(client)["canJoin"] is False
    assert client.post("/api/tutor/group/join", json={"code": code}, headers=CSRF).status_code == 409
    assert client.post("/api/tutor/group", json={"name": "Mine"}, headers=CSRF).status_code == 409

    for i in range(1, 5):
        enter(client, f"t{i}", f"Teacher {i}")
        assert client.post("/api/tutor/group/join", json={"code": code}, headers=CSRF).status_code == 200
    enter(client, "t5", "Teacher Five")
    r = client.post("/api/tutor/group/join", json={"code": code}, headers=CSRF)
    assert r.status_code == 409 and "full" in r.json()["detail"]
    assert client.post("/api/tutor/group/join", json={"code": "ZZZZZZ"}, headers=CSRF).status_code == 404
    assert client.post("/api/tutor/group/join", json={"code": "<b>"}, headers=CSRF).status_code == 422


def test_leave_any_time_and_empty_groups_go(client: TestClient) -> None:
    enter(client, "asha", "Asha Rao")
    code = client.post("/api/tutor/group", json={"name": "Lotus"}, headers=CSRF).json()["group"]["code"]
    enter(client, "meera", "Meera Iyer")
    client.post("/api/tutor/group/join", json={"code": code}, headers=CSRF)
    assert client.post("/api/tutor/group/leave", headers=CSRF).status_code == 204
    assert group(client)["group"] is None
    assert client.post("/api/tutor/group/leave", headers=CSRF).status_code == 204  # already out: fine

    enter(client, "asha", "Asha Rao")
    assert [m["name"] for m in group(client)["group"]["members"]] == ["Asha Rao"]
    assert client.post("/api/tutor/group/leave", headers=CSRF).status_code == 204
    enter(client, "meera", "Meera Iyer")
    assert client.post("/api/tutor/group/join", json={"code": code}, headers=CSRF).status_code == 404


def test_invite_comes_at_day_30_or_programme_end(client: TestClient, settings: Settings) -> None:
    enter(client, "asha", "Asha Rao")
    assert client.get("/api/tutor/home").json()["groupInvite"] is False
    make_old(settings, "asha", 30)
    assert client.get("/api/tutor/home").json()["groupInvite"] is True
    client.post("/api/tutor/group", json={"name": "Lotus"}, headers=CSRF)
    assert client.get("/api/tutor/home").json()["groupInvite"] is False

    enter(client, "nocentre", "No Centre", centre=None)
    make_old(settings, "nocentre", 40)
    assert client.get("/api/tutor/home").json()["groupInvite"] is False  # can't join without a centre


def test_groups_need_consent_and_csrf(client: TestClient) -> None:
    assert (
        client.get("/in", params={"uid": "x", "name": "X", "centre": "EK-1"}, follow_redirects=False).status_code == 303
    )
    assert client.post("/api/tutor/group", json={"name": "Lotus"}, headers=CSRF).status_code == 428
    assert client.post("/api/tutor/group", json={"name": "Lotus"}).status_code == 403
    assert (
        client.get("/in", params={"uid": "y", "name": "Y", "centre": "../x"}, follow_redirects=False).status_code == 400
    )
