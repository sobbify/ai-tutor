"""Learner-facing features around practice: home, onboarding and preferences, phrasebook, "Tell me
what happened", certificate, delete my data, and the nudge feed for the host app.
Everything here is hers only — nothing is exposed to centre heads or the admin console.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import utcnow
from ..models import (
    AppSetting,
    Learner,
    LearnerProfile,
    MomentLevel,
    PhrasebookEntry,
    PracticeDay,
    Reply,
    Run,
    Story,
)
from ..schemas import (
    CertificateOut,
    GrammarFix,
    HomeOut,
    LearnerOut,
    OnboardingIn,
    PhraseOut,
    PreferencesIn,
    PreferencesOut,
    ProgrammeOut,
    Recommendation,
    StoryOut,
    StreakOut,
)
from . import programme as prog
from .content import published_moments
from .journey import Journey
from .story import StoryResult

# ---- home ---------------------------------------------------------------------------------------


async def home(journey: Journey) -> HomeOut:
    db, learner = journey.db, journey.learner
    runs = await journey.all_runs()
    moments = await journey.moments()
    state = await journey.state(runs)
    days = await prog.practice_days(db, learner)
    today = journey.today()
    baseline = next((m for m in moments if m.kind == "baseline"), None)
    baseline_done = baseline is None or journey.completed(runs.get(baseline.id, []))

    recommended: Recommendation | None = None
    programme = [m for m in moments if m.kind == "programme"]
    unfinished = next(
        (m for m in programme if any(not r.completed and r.kind == "full" for r in runs.get(m.id, []))), None
    )
    hardest = next((m for m in programme if m.id == learner.hardest_moment_id), None)
    this_week = [m for m in programme if m.week == state.week]
    if unfinished:
        recommended = Recommendation(moment_id=unfinished.id, title=unfinished.title, reason="continue")
    elif hardest and not journey.completed(runs.get(hardest.id, [])):
        recommended = Recommendation(moment_id=hardest.id, title=hardest.title, reason="hardest")
    elif this_week:
        pick = next((m for m in this_week if not journey.completed(runs.get(m.id, []))), this_week[0])
        recommended = Recommendation(
            moment_id=pick.id, title=pick.title, reason="harder" if state.harder_today else "week"
        )
    told_today = await db.scalar(
        select(Story.id).where(Story.learner_id == learner.id, Story.created_at >= _start_of_today(journey.tz)).limit(1)
    )
    return HomeOut(
        learner=LearnerOut(first_name=learner.first_name),
        consented=learner.consented_at is not None,
        baseline_done=baseline_done,
        programme=ProgrammeOut(
            day=state.day,
            total_days=prog.PROGRAMME_DAYS,
            week=state.week,
            week_title=state.week_title,
            days_practised=state.days_practised,
            practised_today=state.practised_today,
            harder_today=state.harder_today,
            complete=state.complete,
        ),
        streak=StreakOut(days=prog.streak(days, today, await prog.holidays(db)), practised_today=state.practised_today),
        recommended=recommended,
        story_suggested=state.harder_today and told_today is None,
        certificate_earned=learner.certificate_earned_at is not None,
    )


def _start_of_today(tz: str) -> datetime:
    zone = ZoneInfo(tz)
    local = utcnow().astimezone(zone)
    return local.replace(hour=0, minute=0, second=0, microsecond=0)


# ---- onboarding & preferences ---------------------------------------------------------------------


def preferences(learner: Learner) -> PreferencesOut:
    return PreferencesOut(
        quiet_mode=learner.quiet_mode,
        nudge_time=learner.nudge_time,
        hardest_moment_id=learner.hardest_moment_id,
        consented=learner.consented_at is not None,
    )


async def _check_moment(db: AsyncSession, moment_id: str | None) -> None:
    if moment_id and not any(m.id == moment_id and m.kind == "programme" for m in await published_moments(db)):
        raise HTTPException(422, "Choose one of the practice moments")


async def onboard(db: AsyncSession, learner: Learner, body: OnboardingIn) -> PreferencesOut:
    await _check_moment(db, body.hardest_moment_id)
    learner.consented_at = learner.consented_at or utcnow()
    learner.hardest_moment_id = body.hardest_moment_id
    await db.flush()
    return preferences(learner)


async def update_preferences(db: AsyncSession, learner: Learner, body: PreferencesIn) -> PreferencesOut:
    if body.hardest_moment_id is not None:
        await _check_moment(db, body.hardest_moment_id or None)
        learner.hardest_moment_id = body.hardest_moment_id or None
    if body.quiet_mode is not None:
        learner.quiet_mode = body.quiet_mode
    if body.clear_nudge:
        learner.nudge_time = None
    elif body.nudge_time is not None:
        learner.nudge_time = body.nudge_time
    await db.flush()
    return preferences(learner)


# ---- delete my data -------------------------------------------------------------------------------


async def delete_my_data(db: AsyncSession, learner: Learner) -> None:
    """FR-39: her practice history (transcripts), stories, phrasebook, levels and hidden profile — all
    gone. Her consent and preferences stay so she isn't asked again. (Audio is never stored.)"""
    for model in (Run, Story, PhrasebookEntry, PracticeDay, MomentLevel, LearnerProfile):
        await db.execute(delete(model).where(model.learner_id == learner.id))
    learner.certificate_earned_at = None
    await db.flush()


# ---- what may be spoken or saved ------------------------------------------------------------------


async def allowed_source(db: AsyncSession, learner: Learner, text: str) -> str | None:
    """Lines the app shows this learner: model replies and lesson phrases, her own fixes and story
    lines. Anything else is refused, so voice and phrasebook can't be used for arbitrary text."""
    for m in await published_moments(db):
        for t in m.turns:
            if text == t.hint_text or text in (t.hint_options or []):
                return "hint"
        for phrase in (m.lesson or {}).get("phrases", []):
            if text == phrase.get("text"):
                return "lesson"
    if await db.scalar(
        select(Reply.id).join(Run).where(Run.learner_id == learner.id, Reply.fix_better == text).limit(1)
    ):
        return "fix"
    if await db.scalar(
        select(Story.id)
        .where(Story.learner_id == learner.id, (Story.fix_better == text) | (Story.better_line == text))
        .limit(1)
    ):
        return "story"
    return None


# ---- phrasebook ----------------------------------------------------------------------------------

PHRASEBOOK_LIMIT = 200


def phrase_out(p: PhrasebookEntry) -> PhraseOut:
    return PhraseOut.model_validate(p)


async def phrasebook(db: AsyncSession, learner: Learner) -> list[PhraseOut]:
    rows = await db.scalars(
        select(PhrasebookEntry).where(PhrasebookEntry.learner_id == learner.id).order_by(PhrasebookEntry.id.desc())
    )
    return [phrase_out(p) for p in rows]


async def save_phrase(db: AsyncSession, learner: Learner, text: str, moment_id: str | None) -> PhraseOut:
    text = text.strip()
    existing = await db.scalar(
        select(PhrasebookEntry).where(PhrasebookEntry.learner_id == learner.id, PhrasebookEntry.text == text)
    )
    if existing:
        return phrase_out(existing)
    source = await allowed_source(db, learner, text)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Only lines from your practice can be saved")
    count = len(list(await db.scalars(select(PhrasebookEntry.id).where(PhrasebookEntry.learner_id == learner.id))))
    if count >= PHRASEBOOK_LIMIT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Your phrasebook is full. Remove a line to add another.")
    row = PhrasebookEntry(learner_id=learner.id, text=text, source=source, moment_id=moment_id)
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:  # saved twice at the same moment
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Already saved") from None
    return phrase_out(row)


async def phrase(db: AsyncSession, learner: Learner, phrase_id: int) -> PhrasebookEntry:
    row = await db.get(PhrasebookEntry, phrase_id)
    if row is None or row.learner_id != learner.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not in your phrasebook")
    return row


# ---- stories -------------------------------------------------------------------------------------


def story_out(s: Story) -> StoryOut:
    return StoryOut(
        id=s.id,
        heard=True,
        transcript=s.transcript,
        positives=s.positives,
        fix=GrammarFix(wrong=s.fix_wrong or "", better=s.fix_better) if s.fix_better else None,
        tip=s.tip,
        better_line=s.better_line,
        created_at=s.created_at,
    )


async def save_story(
    db: AsyncSession, learner: Learner, result: StoryResult, *, typed: bool, evaluator: str, tz: str
) -> StoryOut:
    if not result.heard:
        return StoryOut(
            id=None, heard=False, transcript="", positives=[], fix=None, tip=None, better_line=None, created_at=None
        )
    row = Story(
        learner_id=learner.id,
        transcript=result.transcript,
        positives=result.positives,
        fix_wrong=result.fix.wrong if result.fix else None,
        fix_better=result.fix.better if result.fix else None,
        better_line=result.better_line,
        tip=result.tip,
        fillers=None if typed else result.fillers,
        typed=typed,
        evaluator=evaluator,
    )
    db.add(row)
    await db.flush()
    await prog.mark_practised(db, learner, prog.local_today(tz))
    return story_out(row)


async def stories(db: AsyncSession, learner: Learner) -> list[StoryOut]:
    rows = await db.scalars(select(Story).where(Story.learner_id == learner.id).order_by(Story.id.desc()).limit(50))
    return [story_out(s) for s in rows]


async def delete_story(db: AsyncSession, learner: Learner, story_id: int) -> None:
    row = await db.get(Story, story_id)
    if row is None or row.learner_id != learner.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Story not found")
    await db.delete(row)
    await db.flush()


# ---- certificate ---------------------------------------------------------------------------------


async def certificate(journey: Journey) -> CertificateOut:
    runs = await journey.all_runs()
    state = await journey.state(runs)
    programme = [m for m in await journey.moments() if m.kind == "programme"]
    left = [m.title for m in programme if not journey.completed(runs.get(m.id, []))]
    learner = journey.learner
    if learner.certificate_earned_at is None and state.complete:
        learner.certificate_earned_at = utcnow()
        await journey.db.flush()
    return CertificateOut(
        earned=learner.certificate_earned_at is not None,
        name=learner.name,
        earned_at=learner.certificate_earned_at,
        moments=[m.title for m in programme],
        days_practised=state.days_practised,
        days_needed=max(0, prog.PROGRAMME_DAYS - state.days_practised),
        moments_left=left,
    )


# ---- nudges for the host app (FR-31 … FR-34) ------------------------------------------------------

ENCOURAGEMENT_KEY = "encouragement"
NUDGES = (
    "A quick practice? Five minutes is enough today.",
    "Ready for today's moment? ELSA is here when you are.",
    "One short role-play today keeps your English warm.",
)
LAST_NUDGE_HOUR = 20  # never after 8 pm


async def due_nudges(db: AsyncSession, tz: str, now: datetime | None = None) -> list[dict[str, str]]:
    """Learners to nudge right now: at or after their chosen time, school days only, never after 8 pm,
    once a day, not if they already practised today. Messages never mention missed days."""
    local = (now or utcnow()).astimezone(ZoneInfo(tz))
    today = local.date()
    if not prog.is_school_day(today, await prog.holidays(db)) or local.hour >= LAST_NUDGE_HOUR:
        return []
    hhmm = local.strftime("%H:%M")
    row = await db.get(AppSetting, ENCOURAGEMENT_KEY)
    encouragement = str((row.value or {}).get("text") or "").strip() if row and isinstance(row.value, dict) else ""
    practised = set(await db.scalars(select(PracticeDay.learner_id).where(PracticeDay.day == today)))
    learners = await db.scalars(
        select(Learner).where(
            Learner.nudge_time.is_not(None),
            Learner.nudge_time <= hhmm,
            Learner.consented_at.is_not(None),
        )
    )
    out: list[dict[str, str]] = []
    for lr in learners:
        if lr.id in practised or lr.last_nudged_on == today:
            continue
        message = NUDGES[(today.toordinal() + lr.id) % len(NUDGES)]
        if encouragement and (lr.last_encouraged_on is None or (today - lr.last_encouraged_on).days >= 7):
            message = encouragement[:200]  # central encouragement, at most once a week
            lr.last_encouraged_on = today
        lr.last_nudged_on = today
        out.append({"uid": lr.uid, "message": message})
    await db.flush()
    return out
