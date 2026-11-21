from __future__ import annotations

from fastapi.testclient import TestClient

from .conftest import CSRF, enter, play_through


def reply(c: TestClient, moment: str, turn: str, text: str | None = None, audio: bool = False):  # type: ignore[no-untyped-def]
    data = {"turn_id": turn, **({"transcript": text} if text else {})}
    files = {"audio": ("r.webm", b"x", "audio/webm")} if audio else None
    return c.post(f"/api/tutor/moments/{moment}/replies", data=data, files=files, headers=CSRF)


MG_FIXES = [
    "She will settle in quickly.",
    "Sure. Just to confirm: five ml of the cough syrup at eleven o’clock?",
    "A short, happy goodbye works best.",
]


def test_progress_starts_with_week_one_and_anytime_open(learner: TestClient) -> None:
    body = learner.get("/api/tutor/progress").json()
    assert body["learner"] == {"firstName": "Priya"}
    status = {m["id"]: (m["kind"], m["week"], m["status"]) for m in body["moments"]}
    assert status == {
        "morning-greeting": ("programme", 1, "available"),
        "pickup-update": ("programme", 1, "available"),
        "parent-meeting": ("programme", 2, "locked"),
        "upset-parent": ("programme", 3, "locked"),
        "admission-tour": ("anytime", None, "available"),
        "phone-call": ("anytime", None, "available"),
        "small-incident": ("anytime", None, "available"),
        "celebration-day": ("anytime", None, "available"),
    }  # the first chat (baseline) is never shown as progress
    assert body["trends"] == {"daysPractised": 0, "fillers": None, "grammarSlips": None}


def test_public_moment_hides_evaluator_data_and_levels(learner: TestClient) -> None:
    moment = learner.get("/api/tutor/moments/morning-greeting").json()
    assert set(moment["turns"][0]) == {"id", "parentLine", "hint", "videoUrl", "mood"}
    # Only the parent's mood shows (for the avatar's face) — never the level number itself.
    assert [t["mood"] for t in moment["turns"]][6:9] == ["calm", "worried", "upset"]
    assert moment["lesson"]["title"] and moment["lesson"]["phrases"][0]["text"]
    assert moment["kind"] == "programme" and moment["week"] == 1


def test_locked_unknown_and_empty(learner: TestClient) -> None:
    assert learner.post("/api/tutor/moments/parent-meeting/run", json={}, headers=CSRF).status_code == 423
    assert learner.get("/api/tutor/moments/nope").status_code == 404
    assert learner.get("/api/tutor/moments/morning-greeting/run").status_code == 204


def test_consent_comes_first(client: TestClient) -> None:
    enter(client, consent=False)
    assert client.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF).status_code == 428
    assert client.get("/api/tutor/home").json()["consented"] is False
    assert client.post("/api/tutor/onboarding", json={"consent": False}, headers=CSRF).status_code == 422
    assert client.post("/api/tutor/onboarding", json={"consent": True}, headers=CSRF).status_code == 200
    assert client.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF).status_code == 200


def test_turns_resume_conflicts_and_retries(learner: TestClient) -> None:
    run = learner.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF).json()
    assert run["turnIds"] == ["mg-1", "mg-med", "mg-2", "mg-3", "mg-4", "mg-5"] and run["kind"] == "full"
    assert learner.post("/api/tutor/moments/morning-greeting/advance", headers=CSRF).status_code == 409
    assert reply(learner, "morning-greeting", "mg-2", "Hello there").status_code == 409
    first = reply(learner, "morning-greeting", "mg-1", "Good morning. Don’t worry, she settle quickly.").json()
    assert first["feedback"]["fix"] == {"wrong": "settle", "better": "She will settle in quickly."}
    assert first["feedback"]["tip"]  # one grammar micro-lesson with the fix
    again = reply(learner, "morning-greeting", "mg-1", "Don’t worry, she will settle in quickly.").json()
    assert again["attempt"] == 2 and again["feedback"]["fix"] is None and again["feedback"]["tip"] is None
    run = learner.post("/api/tutor/moments/morning-greeting/advance", headers=CSRF).json()
    assert run["turnIndex"] == 1 and run["replies"][0]["transcript"] == "Don’t worry, she will settle in quickly."
    resumed = learner.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF).json()
    assert resumed["runNumber"] == 1 and resumed["turnIndex"] == 1


def test_not_heard_is_not_stored(learner: TestClient) -> None:
    learner.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF)
    assert reply(learner, "morning-greeting", "mg-1", "um uh").json()["feedback"] == {
        "heard": False,
        "positives": [],
        "fix": None,
        "tip": None,
    }
    assert learner.post("/api/tutor/moments/morning-greeting/advance", headers=CSRF).status_code == 409


def test_typing_fallback(learner: TestClient) -> None:
    learner.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF)
    url = "/api/tutor/moments/morning-greeting/replies"
    assert learner.post(url, data={"turn_id": "mg-1", "typed": "true"}, headers=CSRF).status_code == 422
    r = learner.post(
        url, data={"turn_id": "mg-1", "typed": "true", "transcript": "Good morning, she will settle in."}, headers=CSRF
    ).json()
    assert r["typed"] is True and r["feedback"]["heard"] is True


def test_completion_unlocks_and_summarises(learner: TestClient) -> None:
    play_through(learner, "morning-greeting")
    summary = learner.get("/api/tutor/moments/morning-greeting/summary").json()
    # Pick-up is in the same week, so it was already open: nothing new to announce.
    assert summary["firstCompletion"] is True and summary["unlocked"] is None
    assert summary["nextMomentId"] == "pickup-update"
    assert [p["fix"]["better"] for p in summary["practise"]] == MG_FIXES
    assert all(p["tip"] for p in summary["practise"])
    progress = {m["id"]: m for m in learner.get("/api/tutor/progress").json()["moments"]}
    assert progress["morning-greeting"]["status"] == "done"
    assert progress["morning-greeting"]["firstTry"] == [False, False, True, False, True, True]
    assert progress["parent-meeting"]["status"] == "locked"

    play_through(learner, "pickup-update")  # finishing week 1 opens week 2 early
    unlocked = learner.get("/api/tutor/moments/pickup-update/summary").json()["unlocked"]
    assert unlocked == {"id": "parent-meeting", "title": "Parent Meeting"}

    learner.post("/api/tutor/moments/morning-greeting/run", json={"restart": True}, headers=CSRF)
    play_through(
        learner,
        "morning-greeting",
        {
            0: "Don’t worry, she will settle in quickly.",
            1: "Sure. Just to confirm: five ml at eleven?",
            3: "Yes, a short, happy goodbye works best.",
        },
    )
    again = learner.get("/api/tutor/moments/morning-greeting/summary").json()
    assert again["firstCompletion"] is False and again["unlocked"] is None and again["previousPractiseCount"] == 3
    assert again["practise"] == []
    m = {x["id"]: x for x in learner.get("/api/tutor/progress").json()["moments"]}["morning-greeting"]
    assert m["timesPractised"] == 2 and m["latest"] == [True] * 6

    # All lines right first time → the hidden level rises: the next run brings surprise follow-ups.
    run = learner.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF).json()
    assert "mg-allergy" in run["turnIds"] and "mg-pickup" in run["turnIds"] and "mg-worry" not in run["turnIds"]
    assert "level" not in run  # never shown


def test_rehearse_now_is_short_and_separate(learner: TestClient) -> None:
    run = learner.post("/api/tutor/moments/phone-call/run", json={"quick": True}, headers=CSRF).json()
    assert run["kind"] == "quick" and run["turnIds"] == ["pc-1", "pc-2", "pc-3"]
    play_through(learner, "phone-call", quick=True)
    assert learner.get("/api/tutor/moments/phone-call/summary").json()["firstCompletion"] is False
    moment = {m["id"]: m for m in learner.get("/api/tutor/progress").json()["moments"]}["phone-call"]
    assert moment["status"] == "available" and moment["timesPractised"] == 0  # quick runs aren't progress
    assert learner.post("/api/tutor/moments/hello-elsa/run", json={"quick": True}, headers=CSRF).status_code == 400


def test_learners_are_isolated(client: TestClient) -> None:
    enter(client, "a", "Ann")
    play_through(client, "morning-greeting")
    enter(client, "b", "Ben")
    assert client.get("/api/tutor/progress").json()["moments"][0]["status"] == "available"
    assert client.get("/api/tutor/progress").json()["trends"]["daysPractised"] == 0
    assert client.get("/api/tutor/moments/morning-greeting/summary").status_code == 404


def test_audio_type_and_size_checked(learner: TestClient) -> None:
    learner.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF)
    bad = learner.post(
        "/api/tutor/moments/morning-greeting/replies",
        data={"turn_id": "mg-1"},
        files={"audio": ("a", b"x", "text/plain")},
        headers=CSRF,
    )
    assert bad.status_code == 415
    ok = learner.post(
        "/api/tutor/moments/morning-greeting/replies",
        data={"turn_id": "mg-1"},
        files={"audio": ("a", b"x", "audio/webm;codecs=opus")},
        headers=CSRF,
    )
    assert ok.status_code == 200


def test_reply_rate_limit(tmp_path) -> None:  # type: ignore[no-untyped-def]
    from ai_tutor.main import create_app

    from .conftest import make_settings

    with TestClient(create_app(make_settings(tmp_path, reply_rate_per_minute=2))) as c:
        enter(c)
        c.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF)
        codes = [reply(c, "morning-greeting", "mg-1", "Hello there friend").status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_evaluator_failure_is_502_and_nothing_saved(tmp_path) -> None:  # type: ignore[no-untyped-def]
    from ai_tutor.main import create_app
    from ai_tutor.services.evaluator import EvaluationUnavailable

    from .conftest import make_settings

    class Down:
        name = "down"

        async def evaluate(self, *a: object, **k: object) -> object:
            raise EvaluationUnavailable("down")

    with TestClient(create_app(make_settings(tmp_path), evaluator=Down())) as c:  # type: ignore[arg-type]
        enter(c)
        c.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF)
        r = reply(c, "morning-greeting", "mg-1", audio=True)
        assert r.status_code == 502 and "try again" in r.json()["detail"]
        assert c.post("/api/tutor/moments/morning-greeting/advance", headers=CSRF).status_code == 409
