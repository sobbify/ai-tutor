"""Practice groups (PRD §05 "Practise together", FR-25/26/28/30).

- Up to 5 teachers, all from the same centre (FR-30); she can leave any time (FR-26).
- Named, not anonymous: members see each other's names and weekly snowflakes, and whether they
  practised today. Never feedback, transcripts or levels (FR-28).
- Groups work towards a shared weekly snowflake goal, like Duolingo's friends quests.
- The invite comes when she finishes the programme or 30 days after joining, whichever is first.
"""

from __future__ import annotations

import re
import secrets
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import utcnow
from ..models import Group, GroupMember, Learner
from ..schemas import GroupMemberOut, GroupOut, GroupStatusOut, HomeGroupOut
from . import programme as prog
from . import snowflakes as sf

MAX_MEMBERS = 5
GOAL_PER_MEMBER = 50  # snowflakes a week each: about three role-plays and a few school days
INVITE_AFTER_DAYS = 30
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I, easy to read out
CODE_LENGTH = 6


def new_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def clean_code(code: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", code.upper())


def invite_due(learner: Learner, programme_complete: bool) -> bool:
    return programme_complete or utcnow() - learner.created_at >= timedelta(days=INVITE_AFTER_DAYS)


async def _membership(db: AsyncSession, learner: Learner) -> Group | None:
    return await db.scalar(
        select(Group)
        .join(GroupMember, GroupMember.group_id == Group.id)
        .where(GroupMember.learner_id == learner.id)
        .options(selectinload(Group.members).selectinload(GroupMember.learner))
    )


async def _out(db: AsyncSession, learner: Learner, group: Group, tz: str) -> GroupOut:
    today = prog.local_today(tz)
    ids = [m.learner_id for m in group.members]
    week = await sf.totals(db, ids, since_day=sf.week_start(today), tz=tz)
    today_ids = await sf.practised_on(db, ids, today)
    members = [
        GroupMemberOut(
            name=m.learner.name,
            first_name=m.learner.first_name,
            is_me=m.learner_id == learner.id,
            week_snowflakes=week.get(m.learner_id, 0),
            practised_today=m.learner_id in today_ids,
        )
        for m in group.members
    ]
    members.sort(key=lambda x: -x.week_snowflakes)  # stable: ties keep the order they joined in
    return GroupOut(
        name=group.name,
        code=group.code,
        members=members,
        max_members=MAX_MEMBERS,
        week_total=sum(m.week_snowflakes for m in members),
        week_goal=GOAL_PER_MEMBER * len(members),
        created_by_me=group.created_by == learner.id,
    )


async def status_for(db: AsyncSession, learner: Learner, tz: str) -> GroupStatusOut:
    group = await _membership(db, learner)
    return GroupStatusOut(
        group=await _out(db, learner, group, tz) if group else None,
        can_join=bool(learner.centre),
    )


async def home_summary(db: AsyncSession, learner: Learner, tz: str) -> HomeGroupOut | None:
    group = await _membership(db, learner)
    if not group:
        return None
    out = await _out(db, learner, group, tz)
    return HomeGroupOut(name=out.name, members=len(out.members), week_total=out.week_total, week_goal=out.week_goal)


def _require(learner: Learner) -> str:
    if learner.consented_at is None:
        raise HTTPException(status.HTTP_428_PRECONDITION_REQUIRED, "Please read and accept how ELSA works first")
    if not learner.centre:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Groups need your centre. Please open ELSA again from Buddy's World."
        )
    return learner.centre


async def create(db: AsyncSession, learner: Learner, name: str, tz: str) -> GroupStatusOut:
    centre = _require(learner)
    if await _membership(db, learner):
        raise HTTPException(status.HTTP_409_CONFLICT, "You're already in a group. Leave it to start a new one.")
    code = new_code()
    while await db.scalar(select(Group.id).where(Group.code == code)):  # 32^6 codes: a clash is rare
        code = new_code()
    group = Group(code=code, name=name, centre=centre, created_by=learner.id)
    db.add(group)
    await db.flush()
    db.add(GroupMember(group_id=group.id, learner_id=learner.id))
    await db.flush()
    db.expire(group)
    return await status_for(db, learner, tz)


async def join(db: AsyncSession, learner: Learner, code: str, tz: str) -> GroupStatusOut:
    centre = _require(learner)
    group = await db.scalar(select(Group).where(Group.code == clean_code(code)))
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No group has that code. Check it with your colleague.")
    if group.centre != centre:
        raise HTTPException(status.HTTP_409_CONFLICT, "That group is for another centre.")  # 403 means signed out
    current = await _membership(db, learner)
    if current is not None:
        if current.id == group.id:
            return await status_for(db, learner, tz)
        raise HTTPException(status.HTTP_409_CONFLICT, "You're already in a group. Leave it to join another.")
    count = await db.scalar(select(func.count()).select_from(GroupMember).where(GroupMember.group_id == group.id))
    if (count or 0) >= MAX_MEMBERS:
        raise HTTPException(status.HTTP_409_CONFLICT, f"That group is full ({MAX_MEMBERS} teachers).")
    db.add(GroupMember(group_id=group.id, learner_id=learner.id))
    await db.flush()
    db.expire(group)
    return await status_for(db, learner, tz)


async def leave(db: AsyncSession, learner: Learner) -> None:
    """She can leave any time. An empty group is deleted."""
    member = await db.get(GroupMember, learner.id)
    if member is None:
        return
    group_id = member.group_id
    await db.delete(member)
    await db.flush()
    left = await db.scalar(select(func.count()).select_from(GroupMember).where(GroupMember.group_id == group_id))
    if not left:
        await db.execute(delete(Group).where(Group.id == group_id))
        await db.flush()
