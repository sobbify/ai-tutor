"""Feedback names every slip in a reply (up to 4), each with its own category and its own
one-change correction, plus the whole reply corrected when there are several."""

from __future__ import annotations

from fastapi.testclient import TestClient

from ai_tutor.schemas import GrammarFix, Slip
from ai_tutor.services.evaluator import MAX_SLIPS, Evaluation, LineContext, focus, tidy
from ai_tutor.services.listen import _tool, evaluation_from_args, reply_spec, story_from_args

from .conftest import CSRF

TWO_SLIPS = "Don't worry, she settle quickly. She have her favourite toy."


def test_tidy_keeps_up_to_four_distinct_slips_with_clean_categories() -> None:
    result = tidy(
        Evaluation(
            heard=True,
            transcript="x",
            positives=["Kind"],
            fix=GrammarFix(wrong="settle", better="She will settle."),
            tip="Use will.",
            category="Verb tense",
            more_fixes=[
                Slip(wrong="Settle", better="She will settle!", category="tense"),  # the same slip again
                Slip(wrong="have", better="She has a toy.", category="subject-verb-agreement"),
                Slip(wrong="", better="  "),  # empty
                Slip(wrong="in morning", better="In the morning.", category="articles"),
                Slip(wrong="discuss about", better="We discuss it.", category="whatever"),
                Slip(wrong="more better", better="It is better.", category="word-choice"),  # a fifth
            ],
            corrected="She will settle. She has a toy.",
        )
    )
    assert result.category == "tense" and result.fix and result.fix.better == "She will settle."
    assert [(m.wrong, m.category) for m in result.more_fixes] == [
        ("have", "agreement"),
        ("in morning", "article"),
        ("discuss about", "grammar"),
    ]
    assert 1 + len(result.more_fixes) == MAX_SLIPS
    assert result.corrected == "She will settle. She has a toy."
    # One slip: no "All together" line (it would repeat the fix).
    one = tidy(
        Evaluation(
            heard=True,
            transcript="x",
            positives=["Kind"],
            fix=GrammarFix(wrong="settle", better="She will settle."),
            corrected="She will settle.",
        )
    )
    assert one.more_fixes == [] and one.corrected is None
    # Extra slips without a main one: the first becomes the main fix.
    promoted = tidy(
        Evaluation(heard=True, transcript="x", positives=["Kind"], fix=None, more_fixes=[Slip(wrong="a", better="B.")])
    )
    assert promoted.fix == GrammarFix(wrong="a", better="B.") and promoted.category == "grammar"


def test_each_fix_is_cut_to_the_sentence_that_changed() -> None:
    said = "Yes sir, you can meet to her tomorrow. She are free at ten o'clock."
    assert focus("Yes sir, you can meet her tomorrow. She are free at ten o'clock.", said) == (
        "Yes sir, you can meet her tomorrow."
    )
    assert focus("Yes sir, you can meet to her tomorrow. She is free at ten o'clock.", said) == (
        "She is free at ten o'clock."
    )
    assert focus("She is free.", said) == "She is free."  # already one sentence
    result = tidy(
        Evaluation(
            heard=True,
            transcript=said,
            positives=["Kind"],
            fix=GrammarFix(
                wrong="meet to her", better="Yes sir, you can meet her tomorrow. She are free at ten o'clock."
            ),
            more_fixes=[
                Slip(wrong="She are", better="Yes sir, you can meet to her tomorrow. She is free at ten o'clock.")
            ],
            corrected="Yes sir, you can meet her tomorrow. She is free at ten o'clock.",
        )
    )
    assert result.fix and result.fix.better == "Yes sir, you can meet her tomorrow."
    assert result.more_fixes[0].better == "She is free at ten o'clock."
    assert result.corrected == "Yes sir, you can meet her tomorrow. She is free at ten o'clock."  # the whole reply


def test_live_tool_takes_a_list_of_slips_and_validates_it() -> None:
    ctx = LineContext(scene="s", character_name="Ria's mother", possessive="her", parent_line="Hi", model_reply="Hi")
    tool = _tool(reply_spec(ctx))
    params = tool.function_declarations[0].parameters
    slip = params.properties["more_fixes"]
    assert slip.type.name == "ARRAY" and set(slip.items.properties) == {"wrong", "better", "tip", "category"}
    result = evaluation_from_args(
        {
            "heard": True,
            "transcript": TWO_SLIPS,
            "positives": ["Kind"],
            "fix_wrong": "settle",
            "fix_better": "Don't worry, she will settle quickly.",
            "tip": "Use will.",
            "category": "tense",
            "more_fixes": [
                {
                    "wrong": "have",
                    "better": "She has her favourite toy.",
                    "tip": "he/she → has",
                    "category": "agreement",
                },
                "nonsense",
                {"wrong": "x"},  # no better
            ],
            "corrected": "Don't worry, she will settle quickly. She has her favourite toy.",
        }
    )
    assert result is not None and [m.category for m in result.more_fixes] == ["agreement"]
    assert result.corrected and result.corrected.endswith("She has her favourite toy.")
    story = story_from_args(
        {
            "heard": True,
            "transcript": "A girl named Asha cry. She eat well.",
            "positives": ["Clear"],
            "fix_wrong": "cry",
            "fix_better": "A girl named Asha cried.",
            "category": "tense",
            "more_fixes": [{"wrong": "eat", "better": "She eats well.", "tip": "", "category": "agreement"}],
        }
    )
    assert story is not None and story.fix and "Asha" not in story.fix.better
    assert [m.better for m in story.more_fixes] == ["She eats well."]


def test_reply_summary_and_phrasebook_carry_every_slip(learner: TestClient) -> None:
    run = learner.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF).json()
    r = learner.post(
        "/api/tutor/moments/morning-greeting/replies",
        data={"turn_id": run["turnIds"][0], "transcript": TWO_SLIPS},
        headers=CSRF,
    )
    feedback = r.json()["feedback"]
    assert feedback["category"] == "tense" and feedback["fix"]["better"] == "She will settle in quickly."
    assert feedback["moreFixes"] == [
        {
            "wrong": "have",
            "better": "She has her favourite toy.",
            "tip": "With he, she or it, add -s: “She likes”, “He has”.",
            "category": "agreement",
        }
    ]
    assert feedback["corrected"] == "She will settle in quickly. She has her favourite toy."

    # Every corrected line can be heard and saved.
    for text in ("She has her favourite toy.", feedback["corrected"]):
        assert learner.post("/api/tutor/phrasebook", json={"text": text}, headers=CSRF).status_code == 201

    # Finish the run: the summary keeps both slips for that line.
    while not run["completed"]:
        i = run["turnIndex"]
        if i > 0:
            learner.post(
                "/api/tutor/moments/morning-greeting/replies",
                data={"turn_id": run["turnIds"][i], "transcript": "Thank you, ma'am, I will check."},
                headers=CSRF,
            )
        run = learner.post("/api/tutor/moments/morning-greeting/advance", headers=CSRF).json()
    item = learner.get("/api/tutor/moments/morning-greeting/summary").json()["practise"][0]
    assert item["category"] == "tense" and [m["category"] for m in item["moreFixes"]] == ["agreement"]
    assert item["corrected"] == feedback["corrected"]


def test_story_names_several_slips(learner: TestClient) -> None:
    story = learner.post(
        "/api/tutor/stories",
        json={"text": "A mother asked me in morning about lunch and I said he eat well."},
        headers=CSRF,
    ).json()
    assert story["category"] == "agreement" and [m["category"] for m in story["moreFixes"]] == ["article"]
    assert story["moreFixes"][0]["better"].startswith("A mother asked me in the morning")
    saved = learner.get("/api/tutor/stories").json()[0]
    assert saved["moreFixes"] == story["moreFixes"]
