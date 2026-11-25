"""Progress highlights: the words she fixed on another try, or since her last run."""

from __future__ import annotations

from fastapi.testclient import TestClient

from ai_tutor.services.improve import improved_words

from .conftest import CSRF


def test_words_she_fixed() -> None:
    before = "Don't worry, she settle quickly. She have many friends."
    slips = [("settle", "She will settle in quickly."), ("have", "She has many friends.")]
    # Both fixed.
    assert improved_words(before, slips, "Don't worry, she will settle in quickly. She has many friends.") == [
        "will",
        "in",
        "has",
    ]
    # One fixed, one not.
    assert improved_words(before, slips, "Don't worry, she settle quickly. She has many friends.") == ["has"]
    # Nothing fixed (or something else entirely).
    assert improved_words(before, slips, before) == []
    assert improved_words(before, slips, "Good morning ma'am.") == []
    # A different sentence that happens to contain the word isn't a fix of that slip.
    assert (
        improved_words(
            "I will check and we practise sharing tomorrow.",
            [("we practise", "We will practise sharing tomorrow.")],
            "Thank you ma'am, I will check today itself.",
        )
        == []
    )
    assert improved_words(before, [], "She has many friends.") == []


def _reply(c: TestClient, turn: str, text: str) -> dict:  # type: ignore[type-arg]
    r = c.post("/api/tutor/moments/morning-greeting/replies", data={"turn_id": turn, "transcript": text}, headers=CSRF)
    assert r.status_code == 200, r.text
    return r.json()  # type: ignore[no-any-return]


def _finish(c: TestClient, run: dict) -> None:  # type: ignore[type-arg]
    while not run["completed"]:
        if not any(r["turnId"] == run["turnIds"][run["turnIndex"]] for r in run["replies"]):
            _reply(c, run["turnIds"][run["turnIndex"]], "Thank you ma'am, I will check today itself.")
        run = c.post("/api/tutor/moments/morning-greeting/advance", headers=CSRF).json()


def test_say_it_again_highlights_the_fix_and_the_summary_lists_it(learner: TestClient) -> None:
    run = learner.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF).json()
    first_turn = run["turnIds"][0]
    first = _reply(learner, first_turn, "Don't worry, she settle quickly.")
    assert first["improved"] == [] and first["feedback"]["fix"]
    again = _reply(learner, first_turn, "Don't worry, she will settle in quickly.")
    assert again["attempt"] == 2 and again["improved"] == ["will", "in"] and again["feedback"]["fix"] is None
    # The run keeps it (e.g. after a reload).
    run = learner.get("/api/tutor/moments/morning-greeting/run").json()
    assert run["replies"][0]["improved"] == ["will", "in"]

    run = learner.post("/api/tutor/moments/morning-greeting/advance", headers=CSRF).json()
    _finish(learner, run)
    improved = learner.get("/api/tutor/moments/morning-greeting/summary").json()["improved"]
    assert improved == [
        {
            "turnId": first_turn,
            "when": "again",
            "before": "Don't worry, she settle quickly.",
            "beforeWrongs": ["settle"],
            "after": "Don't worry, she will settle in quickly.",
            "words": ["will", "in"],
        }
    ]


def test_summary_shows_lines_better_than_last_time(learner: TestClient) -> None:
    run = learner.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF).json()
    first_turn = run["turnIds"][0]
    _reply(learner, first_turn, "Don't worry, she settle quickly.")
    run = learner.post("/api/tutor/moments/morning-greeting/advance", headers=CSRF).json()
    _finish(learner, run)
    assert learner.get("/api/tutor/moments/morning-greeting/summary").json()["improved"] == []

    run = learner.post("/api/tutor/moments/morning-greeting/run", json={"restart": True}, headers=CSRF).json()
    _reply(learner, first_turn, "Don't worry, she will settle in quickly.")
    run = learner.post("/api/tutor/moments/morning-greeting/advance", headers=CSRF).json()
    _finish(learner, run)
    improved = learner.get("/api/tutor/moments/morning-greeting/summary").json()["improved"]
    assert [(i["when"], i["words"], i["beforeWrongs"]) for i in improved] == [("last_time", ["will", "in"], ["settle"])]

    # The Progress screen counts it as a line she fixed.
    assert learner.get("/api/tutor/progress").json()["trends"]["linesFixed"] == 1
