"""The 15-day programme, the school-day streak, hidden difficulty levels and the hidden assessment.

PRD §05: three school weeks, one moment a week (week 1 drop-off and pick-up, week 2 parent meetings,
week 3 worried or upset parents). A programme day is a day she practised — missed days never delay
her. Day 5 of each week is a harder role-play plus "Tell me what happened".

PRD §09: ELSA learns her level from normal practice and shows it to no one — not her, not her
centre head, not the admin console. It only picks the next difficulty.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import utcnow
from ..models import AppSetting, Learner, LearnerProfile, Moment, MomentLevel, PracticeDay, Reply, Run, Turn

PROGRAMME_DAYS = 15
DAYS_PER_WEEK = 5
WEEKS = 3
MAX_LEVEL = 4
QUICK_LINES = 3  # "Rehearse now" (about 5 minutes)
WEEK_TITLES = {1: "Drop-off and pick-up", 2: "Parent meetings", 3: "Worried or upset parents"}
HOLIDAYS_KEY = "holidays"
PROFILE_REFRESH = timedelta(days=7)


def local_today(tz: str, now: datetime | None = None) -> date:
    return (now or utcnow()).astimezone(ZoneInfo(tz)).date()


async def holidays(db: AsyncSession) -> set[date]:
    row = await db.get(AppSetting, HOLIDAYS_KEY)
    out: set[date] = set()
    for value in row.value if row and isinstance(row.value, list) else []:
        try:
            out.add(date.fromisoformat(str(value)))
        except ValueError:
            continue
    return out


def is_school_day(day: date, off: set[date]) -> bool:
    return day.weekday() < 5 and day not in off


# ---- programme day & streak -------------------------------------------------------------------


@dataclass(frozen=True)
class ProgrammeState:
    day: int  # 1..15: today's programme day
    week: int  # 1..3
    days_practised: int
    practised_today: bool
    harder_today: bool  # day 5 of a week: harder role-play + "Tell me what happened"
    complete: bool

    @property
    def week_title(self) -> str:
        return WEEK_TITLES[self.week]


def programme_state(days: Sequence[date], today: date, programme_done: bool) -> ProgrammeState:
    practised_today = today in days
    count = len(days)
    day = min(PROGRAMME_DAYS, count if practised_today else count + 1)
    week = min(WEEKS, (day - 1) // DAYS_PER_WEEK + 1)
    return ProgrammeState(
        day=day,
        week=week,
        days_practised=count,
        practised_today=practised_today,
        harder_today=day % DAYS_PER_WEEK == 0,
        complete=count >= PROGRAMME_DAYS and programme_done,
    )


def streak(days: Iterable[date], today: date, off: set[date]) -> int:
    """Consecutive school days practised (weekends and holidays don't count), with one free miss per
    week. Today only counts once she has practised — not practising yet today never breaks it."""
    practised = set(days)
    if not practised:
        return 0
    first = min(practised)
    count = 0
    misses: dict[tuple[int, int], int] = {}
    day = today
    while day >= first:
        if is_school_day(day, off):
            if day in practised:
                count += 1
            elif day != today:
                week = day.isocalendar()[:2]
                misses[week] = misses.get(week, 0) + 1
                if misses[week] > 1:
                    break
        day -= timedelta(days=1)
    return count


async def practice_days(db: AsyncSession, learner: Learner) -> list[date]:
    rows = await db.scalars(
        select(PracticeDay.day).where(PracticeDay.learner_id == learner.id).order_by(PracticeDay.day)
    )
    return list(rows)


async def mark_practised(db: AsyncSession, learner: Learner, today: date) -> None:
    if await db.get(PracticeDay, (learner.id, today)) is None:
        db.add(PracticeDay(learner_id=learner.id, day=today))
        await db.flush()


# ---- runs & levels ------------------------------------------------------------------------------


def run_turns(m: Moment, run: Run) -> list[Turn]:
    """The lines of this run: everything up to its level; a quick run keeps the first few."""
    turns = [t for t in m.turns if t.min_level <= run.level] or list(m.turns[:1])
    return turns[:QUICK_LINES] if run.kind == "quick" else turns


async def profile(db: AsyncSession, learner: Learner) -> LearnerProfile | None:
    return await db.get(LearnerProfile, learner.id)


async def stored_level(db: AsyncSession, learner: Learner, m: Moment) -> int:
    row = await db.get(MomentLevel, (learner.id, m.id))
    if row is not None:
        return row.level
    p = await profile(db, learner)
    return 2 if p is not None and p.band >= 3 else 1  # a confident baseline starts with follow-ups


async def run_level(db: AsyncSession, learner: Learner, m: Moment, *, harder_today: bool) -> int:
    if m.kind == "baseline":
        return 1
    level = await stored_level(db, learner, m)
    if m.kind == "programme" and harder_today:
        level += 1  # day 5: a harder role-play
    return min(MAX_LEVEL, level)


def run_quality(m: Moment, run: Run) -> tuple[float, float]:
    """Share of lines right on the first try, and average fillers per spoken line."""
    turns = run_turns(m, run)
    firsts: list[Reply] = []
    for t in turns:
        attempts = [r for r in run.replies if r.turn_id == t.id]
        if attempts:
            firsts.append(attempts[0])
    if not firsts:
        return 0.0, 0.0
    right = sum(1 for r in firsts if r.fix_better is None) / len(turns)
    spoken = [r.fillers for r in firsts if r.fillers is not None and not r.typed]
    return right, (sum(spoken) / len(spoken)) if spoken else 0.0


async def after_run(db: AsyncSession, learner: Learner, m: Moment, run: Run) -> None:
    """Difficulty rises only when she's ready (never shown, never lowered). Her level for a moment is
    fixed once she has played it, so a later profile refresh doesn't change it under her."""
    if run.kind != "full" or m.kind == "baseline":
        return
    row = await db.get(MomentLevel, (learner.id, m.id))
    if row is None:
        row = MomentLevel(
            learner_id=learner.id, moment_id=m.id, level=min(run.level, await stored_level(db, learner, m))
        )
        db.add(row)
    right, fillers = run_quality(m, run)
    if right >= 0.75 and fillers <= 2:
        # Ready: one step up from a normal run; a harder (day 5) run she managed becomes her level.
        row.level = min(MAX_LEVEL, max(row.level, run.level + 1 if run.level <= row.level else run.level))
    await db.flush()


# ---- hidden assessment --------------------------------------------------------------------------


def band_for(score: float) -> int:
    return 1 if score < 0.4 else 2 if score < 0.6 else 3 if score < 0.8 else 4


async def refresh_profile(db: AsyncSession, learner: Learner, *, force: bool = False) -> LearnerProfile | None:
    """Recompute from her last replies, at most weekly unless forced (e.g. after the baseline chat)."""
    p = await profile(db, learner)
    if p is not None and not force and utcnow() - p.updated_at < PROFILE_REFRESH:
        return p
    replies = list(
        await db.scalars(
            select(Reply).join(Run).where(Run.learner_id == learner.id).order_by(Reply.id.desc()).limit(80)
        )
    )
    if not replies:
        return p
    n = len(replies)

    def share(key: str) -> float:
        values = [bool(r.signals.get(key)) for r in replies if key in (r.signals or {})]
        return sum(values) / len(values) if values else 0.5

    spoken = [r.fillers for r in replies if r.fillers is not None and not r.typed]
    fluency = 1 - min(1.0, (sum(spoken) / len(spoken)) / 4) if spoken else 0.5
    grammar = sum(1 for r in replies if r.fix_better is None) / n
    scores = {
        "fluency": fluency,
        "grammar": grammar,
        "vocabulary": share("polite"),
        "listening": share("answered"),
        "intelligibility": share("intelligible"),
    }
    if p is None:
        p = LearnerProfile(learner_id=learner.id)
        db.add(p)
    for key, value in scores.items():
        setattr(p, key, round(value, 3))
    p.band = band_for(sum(scores.values()) / len(scores))
    p.replies_counted = n
    p.updated_at = utcnow()
    await db.flush()
    return p
