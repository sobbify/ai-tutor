"""Snowflakes: ELSA's XP, earned per session like Duolingo's XP per lesson.

Snowflakes reward effort only — finishing a role-play, saying a line again, telling a story,
practising on a school day. They never depend on how well she spoke, so sharing them with her
group shows who practised, not who is better (PRD FR-28: feedback stays private).

Worked out from what she already did (finished runs, retries, stories, practice days), so there is
no separate ledger to keep in step, and deleting her data (FR-39) resets them too.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import PracticeDay, Reply, Run, Story
from ..schemas import SnowflakeItem

FINISHED = 15  # a full role-play (or the first chat)
QUICK = 10  # "Rehearse now": the first few lines
AGAIN = 2  # each "Say it again"
AGAIN_CAP = 10  # per session, so retrying never beats moving on
STORY = 10  # "Tell me what happened"
DAILY = 5  # first practice on a school day


def week_start(today: date) -> date:
    """Weeks run Monday to Sunday (school weeks)."""
    return today - timedelta(days=today.weekday())


def local_midnight_utc(day: date, tz: str) -> datetime:
    return datetime.combine(day, time.min, tzinfo=ZoneInfo(tz))


def run_items(run: Run) -> list[SnowflakeItem]:
    """What one finished session earned."""
    if not run.completed:
        return []
    quick = run.kind == "quick"
    items = [SnowflakeItem(kind="quick" if quick else "finished", amount=QUICK if quick else FINISHED)]
    again = sum(1 for r in run.replies if r.attempt > 1)
    if again:
        items.append(SnowflakeItem(kind="again", amount=min(AGAIN_CAP, again * AGAIN)))
    return items


async def totals(
    db: AsyncSession, learner_ids: Iterable[int], *, since_day: date | None = None, tz: str = "Asia/Kolkata"
) -> dict[int, int]:
    """Snowflakes per learner, all time or from `since_day` (her local date) on."""
    ids = list(set(learner_ids))
    out: dict[int, int] = defaultdict(int)
    if not ids:
        return out
    since = local_midnight_utc(since_day, tz) if since_day else None

    runs_q = select(Run.id, Run.learner_id, Run.kind).where(Run.learner_id.in_(ids), Run.completed.is_(True))
    if since:
        runs_q = runs_q.where(Run.completed_at >= since)
    runs = (await db.execute(runs_q)).all()
    if runs:
        retries = dict(
            (
                await db.execute(
                    select(Reply.run_id, func.count())
                    .where(Reply.run_id.in_([r.id for r in runs]), Reply.attempt > 1)
                    .group_by(Reply.run_id)
                )
            ).all()
        )
        for r in runs:
            base = QUICK if r.kind == "quick" else FINISHED
            out[r.learner_id] += base + min(AGAIN_CAP, retries.get(r.id, 0) * AGAIN)

    stories_q = select(Story.learner_id, func.count()).where(Story.learner_id.in_(ids)).group_by(Story.learner_id)
    if since:
        stories_q = stories_q.where(Story.created_at >= since)
    for learner_id, n in (await db.execute(stories_q)).all():
        out[learner_id] += n * STORY

    days_q = (
        select(PracticeDay.learner_id, func.count())
        .where(PracticeDay.learner_id.in_(ids))
        .group_by(PracticeDay.learner_id)
    )
    if since_day:
        days_q = days_q.where(PracticeDay.day >= since_day)
    for learner_id, n in (await db.execute(days_q)).all():
        out[learner_id] += n * DAILY
    return out


async def practised_on(db: AsyncSession, learner_ids: Iterable[int], day: date) -> set[int]:
    ids = list(set(learner_ids))
    if not ids:
        return set()
    rows = await db.scalars(
        select(PracticeDay.learner_id).where(PracticeDay.learner_id.in_(ids), PracticeDay.day == day)
    )
    return set(rows)
