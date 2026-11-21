"""Queries and commands behind the admin database console."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Generic, Literal, TypeVar

from fastapi import HTTPException, status
from sqlalchemy import Select, and_, case, delete, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import UTC, utcnow
from ..models import AdminUser, AppSetting, AuditLog, Learner, LearnerSession, Moment, Reply, Run, Turn
from ..schemas import Camel
from .content import CONTENT_VERSION_KEY, apply_moment, file_version, load_file, moment_from_db
from .journey import Journey

# ---- schemas ------------------------------------------------------------------------------


T = TypeVar("T")


class Page(Camel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int


class Kpis(Camel):
    learners: int
    active_learners_week: int
    signed_in_now: int
    replies_total: int
    replies_week: int
    completed_runs: int
    accuracy_month: float | None
    avg_eval_ms: int | None


class DayPoint(Camel):
    date: str
    replies: int
    learners: int


class MomentStat(Camel):
    id: str
    title: str
    learners_started: int
    completions: int
    accuracy: float | None


class FixStat(Camel):
    wrong: str
    better: str
    count: int


class Stats(Camel):
    kpis: Kpis
    activity: list[DayPoint]
    moments: list[MomentStat]
    top_fixes: list[FixStat]


class LearnerRow(Camel):
    uid: str
    name: str
    created_at: datetime
    last_seen_at: datetime
    moments_done: int
    replies: int
    accuracy: float | None


class ReplyRow(Camel):
    id: int
    learner_uid: str
    learner_name: str
    moment_id: str
    moment_title: str
    turn_id: str
    parent_line: str
    transcript: str
    attempt: int
    fix_wrong: str | None
    fix_better: str | None
    positives: list[str]
    evaluator: str
    latency_ms: int
    created_at: datetime


class SessionRow(Camel):
    created_at: datetime
    last_used_at: datetime
    expires_at: datetime
    user_agent: str


class LearnerDetail(Camel):
    uid: str
    name: str
    created_at: datetime
    last_seen_at: datetime
    sessions: list[SessionRow]
    progress: list[dict[str, Any]]
    recent_replies: list[ReplyRow]


class MomentRow(Camel):
    id: str
    title: str
    order: int
    icon: str
    kind: str
    week: int | None
    published: bool
    lines: int
    videos: int
    learners_started: int
    updated_at: datetime


class AuditRow(Camel):
    id: int
    admin_username: str
    action: str
    target_type: str
    target_id: str
    detail: dict[str, Any]
    created_at: datetime


class AdminRow(Camel):
    username: str
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None


# ---- helpers ---------------------------------------------------------------------------------


def like(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def paginate(db: AsyncSession, stmt: Select[Any], page: int, size: int) -> tuple[list[Any], int]:
    total = await db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = (await db.execute(stmt.limit(size).offset((page - 1) * size))).all()
    return list(rows), int(total)


def first_attempt_filter() -> Any:
    return Reply.attempt == 1


async def audit(
    db: AsyncSession, admin: AdminUser | None, action: str, target_type: str, target_id: str, **detail: Any
) -> None:
    db.add(
        AuditLog(
            admin_id=admin.id if admin else None,
            admin_username=admin.username if admin else "system",
            action=action,
            target_type=target_type,
            target_id=target_id[:128],
            detail=detail,
        )
    )


# ---- dashboard ----------------------------------------------------------------------------


async def stats(db: AsyncSession, days: int = 30) -> Stats:
    now = utcnow()
    week = now - timedelta(days=7)
    month = now - timedelta(days=days)

    learners = await db.scalar(select(func.count()).select_from(Learner)) or 0
    active = await db.scalar(select(func.count()).select_from(Learner).where(Learner.last_seen_at >= week)) or 0
    signed_in = (
        await db.scalar(select(func.count(distinct(LearnerSession.learner_id))).where(LearnerSession.expires_at > now))
        or 0
    )
    replies_total = await db.scalar(select(func.count()).select_from(Reply)) or 0
    replies_week = await db.scalar(select(func.count()).select_from(Reply).where(Reply.created_at >= week)) or 0
    completed = await db.scalar(select(func.count()).select_from(Run).where(Run.completed.is_(True))) or 0
    acc_row = (
        await db.execute(
            select(func.count(), func.sum(case((Reply.fix_better.is_(None), 1), else_=0))).where(
                Reply.attempt == 1, Reply.created_at >= month
            )
        )
    ).one()
    accuracy = round(100 * (acc_row[1] or 0) / acc_row[0], 1) if acc_row[0] else None
    avg_ms = await db.scalar(select(func.avg(Reply.latency_ms)).where(Reply.created_at >= month))

    # Activity per UTC day (computed in Python so it works the same on SQLite and PostgreSQL).
    recent = (
        await db.execute(
            select(Reply.created_at, Run.learner_id).join(Run, Run.id == Reply.run_id).where(Reply.created_at >= month)
        )
    ).all()
    buckets: dict[str, tuple[int, set[int]]] = {}
    for created, learner_id in recent:
        key = created.astimezone(UTC).date().isoformat()
        count, people = buckets.get(key, (0, set()))
        people.add(learner_id)
        buckets[key] = (count + 1, people)
    activity = []
    for i in range(days - 1, -1, -1):
        key = (now - timedelta(days=i)).date().isoformat()
        count, people = buckets.get(key, (0, set()))
        activity.append(DayPoint(date=key, replies=count, learners=len(people)))

    moments = list(await db.scalars(select(Moment).order_by(Moment.position)))
    started = dict(
        (await db.execute(select(Run.moment_id, func.count(distinct(Run.learner_id))).group_by(Run.moment_id))).all()
    )
    completions = dict(
        (
            await db.execute(select(Run.moment_id, func.count()).where(Run.completed.is_(True)).group_by(Run.moment_id))
        ).all()
    )
    acc_by_moment = {
        mid: (total, ok)
        for mid, total, ok in (
            await db.execute(
                select(Run.moment_id, func.count(), func.sum(case((Reply.fix_better.is_(None), 1), else_=0)))
                .join(Run, Run.id == Reply.run_id)
                .where(Reply.attempt == 1)
                .group_by(Run.moment_id)
            )
        ).all()
    }
    moment_stats = [
        MomentStat(
            id=m.id,
            title=m.title,
            learners_started=started.get(m.id, 0),
            completions=completions.get(m.id, 0),
            accuracy=round(100 * (acc_by_moment[m.id][1] or 0) / acc_by_moment[m.id][0], 1)
            if m.id in acc_by_moment
            else None,
        )
        for m in moments
    ]

    fixes = (
        await db.execute(
            select(Reply.fix_wrong, Reply.fix_better, func.count().label("n"))
            .where(Reply.fix_better.is_not(None))
            .group_by(Reply.fix_wrong, Reply.fix_better)
            .order_by(func.count().desc())
            .limit(8)
        )
    ).all()

    return Stats(
        kpis=Kpis(
            learners=learners,
            active_learners_week=active,
            signed_in_now=signed_in,
            replies_total=replies_total,
            replies_week=replies_week,
            completed_runs=completed,
            accuracy_month=accuracy,
            avg_eval_ms=int(avg_ms) if avg_ms is not None else None,
        ),
        activity=activity,
        moments=moment_stats,
        top_fixes=[FixStat(wrong=w or "", better=b or "", count=n) for w, b, n in fixes],
    )


# ---- learners ----------------------------------------------------------------------------

LearnerSort = Literal["last_seen", "name", "created", "replies"]


async def list_learners(db: AsyncSession, q: str, sort: LearnerSort, page: int, size: int) -> Page[LearnerRow]:
    replies = (
        select(
            Run.learner_id.label("lid"),
            func.count(Reply.id).label("n"),
            func.sum(case((and_(Reply.attempt == 1, Reply.fix_better.is_(None)), 1), else_=0)).label("ok"),
            func.sum(case((Reply.attempt == 1, 1), else_=0)).label("first"),
        )
        .join(Reply, Reply.run_id == Run.id)
        .group_by(Run.learner_id)
        .subquery()
    )
    done = (
        select(Run.learner_id.label("lid"), func.count(distinct(Run.moment_id)).label("d"))
        .where(Run.completed.is_(True))
        .group_by(Run.learner_id)
        .subquery()
    )
    stmt = (
        select(Learner, func.coalesce(replies.c.n, 0), replies.c.ok, replies.c.first, func.coalesce(done.c.d, 0))
        .outerjoin(replies, replies.c.lid == Learner.id)
        .outerjoin(done, done.c.lid == Learner.id)
    )
    if q:
        stmt = stmt.where(or_(Learner.uid.ilike(like(q), escape="\\"), Learner.name.ilike(like(q), escape="\\")))
    order = {
        "last_seen": Learner.last_seen_at.desc(),
        "name": func.lower(Learner.name).asc(),
        "created": Learner.created_at.desc(),
        "replies": func.coalesce(replies.c.n, 0).desc(),
    }[sort]
    rows, total = await paginate(db, stmt.order_by(order, Learner.id), page, size)
    items = [
        LearnerRow(
            uid=lr.uid,
            name=lr.name,
            created_at=lr.created_at,
            last_seen_at=lr.last_seen_at,
            moments_done=d,
            replies=n,
            accuracy=round(100 * (ok or 0) / first, 1) if first else None,
        )
        for lr, n, ok, first, d in rows
    ]
    return Page[LearnerRow](items=items, total=total, page=page, size=size)


def _reply_rows_stmt() -> Any:  # Select[Reply, str, str, str, str]
    return (
        select(Reply, Learner.uid, Learner.name, Moment.id, Moment.title)
        .join(Run, Run.id == Reply.run_id)
        .join(Learner, Learner.id == Run.learner_id)
        .join(Moment, Moment.id == Run.moment_id)
    )


def _reply_row(r: Reply, uid: str, name: str, mid: str, title: str) -> ReplyRow:
    return ReplyRow(
        id=r.id,
        learner_uid=uid,
        learner_name=name,
        moment_id=mid,
        moment_title=title,
        turn_id=r.turn_id,
        parent_line=r.parent_line,
        transcript=r.transcript,
        attempt=r.attempt,
        fix_wrong=r.fix_wrong,
        fix_better=r.fix_better,
        positives=r.positives,
        evaluator=r.evaluator,
        latency_ms=r.latency_ms,
        created_at=r.created_at,
    )


async def learner_detail(db: AsyncSession, learner: Learner) -> LearnerDetail:
    sessions = list(
        await db.scalars(
            select(LearnerSession)
            .where(LearnerSession.learner_id == learner.id, LearnerSession.expires_at > utcnow())
            .order_by(LearnerSession.last_used_at.desc())
        )
    )
    progress = await Journey(db, learner).progress()
    recent = (
        await db.execute(_reply_rows_stmt().where(Learner.id == learner.id).order_by(Reply.created_at.desc()).limit(50))
    ).all()
    return LearnerDetail(
        uid=learner.uid,
        name=learner.name,
        created_at=learner.created_at,
        last_seen_at=learner.last_seen_at,
        sessions=[
            SessionRow(
                created_at=s.created_at, last_used_at=s.last_used_at, expires_at=s.expires_at, user_agent=s.user_agent
            )
            for s in sessions
        ],
        progress=[m.model_dump(by_alias=True) for m in progress.moments],
        recent_replies=[_reply_row(*row) for row in recent],
    )


async def learner_export(db: AsyncSession, learner: Learner) -> dict[str, Any]:
    runs = list(
        await db.scalars(
            select(Run).where(Run.learner_id == learner.id).options(selectinload(Run.replies)).order_by(Run.created_at)
        )
    )
    return {
        "learner": {
            "uid": learner.uid,
            "name": learner.name,
            "createdAt": learner.created_at.isoformat(),
            "lastSeenAt": learner.last_seen_at.isoformat(),
        },
        "runs": [
            {
                "momentId": r.moment_id,
                "runNumber": r.run_number,
                "completed": r.completed,
                "createdAt": r.created_at.isoformat(),
                "completedAt": r.completed_at.isoformat() if r.completed_at else None,
                "replies": [
                    {
                        "turnId": p.turn_id,
                        "parentLine": p.parent_line,
                        "attempt": p.attempt,
                        "transcript": p.transcript,
                        "fix": {"wrong": p.fix_wrong, "better": p.fix_better} if p.fix_better else None,
                        "positives": p.positives,
                        "createdAt": p.created_at.isoformat(),
                    }
                    for p in r.replies
                ],
            }
            for r in runs
        ],
    }


async def reset_progress(db: AsyncSession, learner: Learner, moment_id: str | None) -> int:
    stmt = delete(Run).where(Run.learner_id == learner.id)
    if moment_id:
        stmt = stmt.where(Run.moment_id == moment_id)
    result = await db.execute(stmt)
    return int(getattr(result, "rowcount", 0) or 0)


async def sign_out_learner(db: AsyncSession, learner: Learner) -> int:
    result = await db.execute(delete(LearnerSession).where(LearnerSession.learner_id == learner.id))
    return int(getattr(result, "rowcount", 0) or 0)


# ---- replies ---------------------------------------------------------------------------------


async def list_replies(
    db: AsyncSession,
    *,
    q: str,
    moment: str | None,
    outcome: Literal["all", "fix", "clean"],
    learner_uid: str | None,
    page: int,
    size: int,
) -> Page[ReplyRow]:
    stmt = _reply_rows_stmt()
    if moment:
        stmt = stmt.where(Moment.id == moment)
    if learner_uid:
        stmt = stmt.where(Learner.uid == learner_uid)
    if outcome == "fix":
        stmt = stmt.where(Reply.fix_better.is_not(None))
    elif outcome == "clean":
        stmt = stmt.where(Reply.fix_better.is_(None))
    if q:
        pattern = like(q)
        stmt = stmt.where(
            or_(
                Reply.transcript.ilike(pattern, escape="\\"),
                Learner.uid.ilike(pattern, escape="\\"),
                Learner.name.ilike(pattern, escape="\\"),
            )
        )
    rows, total = await paginate(db, stmt.order_by(Reply.created_at.desc(), Reply.id.desc()), page, size)
    return Page[ReplyRow](items=[_reply_row(*r) for r in rows], total=total, page=page, size=size)


# ---- content ---------------------------------------------------------------------------------


async def list_moments(db: AsyncSession) -> list[MomentRow]:
    moments = list(await db.scalars(select(Moment).options(selectinload(Moment.turns)).order_by(Moment.position)))
    started = dict(
        (await db.execute(select(Run.moment_id, func.count(distinct(Run.learner_id))).group_by(Run.moment_id))).all()
    )
    return [
        MomentRow(
            id=m.id,
            title=m.title,
            order=m.position,
            icon=m.icon,
            kind=m.kind,
            week=m.week,
            published=m.published,
            lines=len(m.turns),
            videos=sum(1 for t in m.turns if t.video_url),
            learners_started=started.get(m.id, 0),
            updated_at=m.updated_at,
        )
        for m in moments
    ]


async def save_moment(db: AsyncSession, existing: Moment | None, data: Any) -> Moment:
    """Create or update a moment, keeping positions 1..n with no gaps or clashes."""
    moments = list(await db.scalars(select(Moment).options(selectinload(Moment.turns)).order_by(Moment.position)))
    target = existing or Moment(id=data.id, turns=[])
    others = [m for m in moments if m.id != target.id]
    index = max(0, min(data.order - 1, len(others)))
    ordered = [*others[:index], target, *others[index:]]
    # Free the unique positions first, then assign the final ones.
    for i, m in enumerate(others):
        m.position = -(i + 1)
    if existing is not None:
        existing.position = -(len(others) + 1)
        for i, t in enumerate(existing.turns):  # same trick for line positions within the moment
            t.position = -(i + 1)
    await db.flush()
    turn_ids = {t.id for t in target.turns}
    clash = await db.scalar(
        select(Turn.id)
        .where(Turn.id.in_([t.id for t in data.turns if t.id not in turn_ids]), Turn.moment_id != target.id)
        .limit(1)
    )
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Line id “{clash}” is already used in another moment")
    apply_moment(target, data)
    if existing is None:
        db.add(target)
    for i, m in enumerate(ordered, start=1):
        m.position = i
    await db.flush()
    return target


async def upgrade_content(db: AsyncSession, path: Path) -> int:
    """Push a newer content file (its "version") into an existing database. Practice history is kept:
    moments and lines are updated in place by id; moments only in the database are left alone."""
    version = file_version(path)
    row = await db.get(AppSetting, CONTENT_VERSION_KEY)
    if version <= (int(row.value) if row else 1):
        return 0
    moments = sorted(load_file(path), key=lambda m: m.order)
    for data in moments:
        existing = await db.scalar(select(Moment).where(Moment.id == data.id).options(selectinload(Moment.turns)))
        await save_moment(db, existing, data)
    if row is None:
        db.add(AppSetting(key=CONTENT_VERSION_KEY, value=version))
    else:
        row.value = version
    await db.flush()
    return len(moments)


async def delete_moment(db: AsyncSession, moment: Moment) -> None:
    await db.delete(moment)
    await db.flush()
    rest = list(await db.scalars(select(Moment).order_by(Moment.position)))
    for i, m in enumerate(rest):
        m.position = -(i + 1)
    await db.flush()
    for i, m in enumerate(rest, start=1):
        m.position = i


async def export_content(db: AsyncSession) -> dict[str, Any]:
    moments = list(await db.scalars(select(Moment).options(selectinload(Moment.turns)).order_by(Moment.position)))
    return {"moments": [moment_from_db(m).model_dump(by_alias=True) for m in moments]}


# ---- backup ----------------------------------------------------------------------------------


async def backup(db: AsyncSession) -> dict[str, Any]:
    learners = list(await db.scalars(select(Learner).order_by(Learner.id)))
    return {
        "format": "ai-tutor-backup",
        "version": 1,
        "createdAt": utcnow().isoformat(),
        "content": await export_content(db),
        "learners": [await learner_export(db, lr) for lr in learners],
    }


# ---- audit & admins --------------------------------------------------------------------------


async def list_audit(db: AsyncSession, action: str | None, page: int, size: int) -> Page[AuditRow]:
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    rows, total = await paginate(db, stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()), page, size)
    return Page[AuditRow](items=[AuditRow.model_validate(r[0]) for r in rows], total=total, page=page, size=size)


async def list_admins(db: AsyncSession) -> list[AdminRow]:
    return [AdminRow.model_validate(a) for a in await db.scalars(select(AdminUser).order_by(AdminUser.username))]
