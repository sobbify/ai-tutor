"""Practice scripts: seed from content/moments.json, convert to API shapes, import/export."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Literal

from pydantic import Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models import AppSetting, Moment, Turn
from ..schemas import (
    Camel,
    CharacterOut,
    Lesson,
    MomentIcon,
    MomentKind,
    MomentOut,
    SentenceHint,
    StartersHint,
    TurnOut,
)

SLUG = r"^[a-z0-9-]{1,64}$"


class KnownFixIn(Camel):
    pattern: str = Field(min_length=1, max_length=200)
    wrong: str = Field(min_length=1, max_length=200)
    better: str = Field(min_length=1, max_length=500)

    @field_validator("pattern")
    @classmethod
    def _regex(cls, v: str) -> str:
        try:
            re.compile(v)
        except re.error as exc:
            raise ValueError(f"Invalid pattern: {exc}") from exc
        return v


class TurnIn(Camel):
    id: str = Field(pattern=SLUG)
    parent_line: str = Field(min_length=1, max_length=500)
    hint: SentenceHint | StartersHint = Field(discriminator="kind")
    video_url: str | None = Field(default=None, max_length=500)
    demo_reply: str = Field(default="", max_length=500)
    known_fixes: list[KnownFixIn] = Field(default_factory=list, max_length=10)
    min_level: int = Field(default=1, ge=1, le=4)

    @field_validator("video_url")
    @classmethod
    def _https(cls, v: str | None) -> str | None:
        v = (v or "").strip() or None
        if v and not v.startswith("https://"):
            raise ValueError("Video URLs must start with https://")
        return v


class CharacterIn(Camel):
    name: str = Field(min_length=1, max_length=80)
    role: str = Field(default="Parent", min_length=1, max_length=40)
    initials: str = Field(min_length=1, max_length=3)
    poster_url: str | None = Field(default=None, max_length=500)


class MomentIn(Camel):
    """Full moment as edited in the console (and stored in moments.json)."""

    id: str = Field(pattern=SLUG)
    title: str = Field(min_length=1, max_length=120)
    order: int = Field(ge=1, le=100)
    icon: MomentIcon
    scene: str = Field(min_length=1, max_length=500)
    character: CharacterIn
    possessive: Literal["her", "his", "their"] = "her"
    published: bool = True
    kind: MomentKind = "programme"
    week: int | None = Field(default=None, ge=1, le=3)
    lesson: Lesson | None = None
    turns: list[TurnIn] = Field(min_length=1, max_length=40)

    @model_validator(mode="after")
    def _unique_turns(self) -> MomentIn:
        ids = [t.id for t in self.turns]
        if len(ids) != len(set(ids)):
            raise ValueError("Line ids must be unique")
        if not any(t.min_level == 1 for t in self.turns):
            raise ValueError("At least one line must be level 1")
        if self.kind == "programme" and self.week is None:
            raise ValueError("Programme moments need a week (1–3)")
        if self.kind != "programme":
            self.week = None
        return self


def moment_from_db(m: Moment) -> MomentIn:
    return MomentIn(
        id=m.id,
        title=m.title,
        order=m.position,
        icon=m.icon,
        scene=m.scene,
        character=CharacterIn(
            name=m.character_name, role=m.character_role, initials=m.character_initials, poster_url=m.poster_url
        ),
        possessive=m.possessive,
        published=m.published,
        kind=m.kind,
        week=m.week,
        lesson=Lesson.model_validate(m.lesson) if m.lesson else None,
        turns=[
            TurnIn(
                id=t.id,
                parent_line=t.parent_line,
                hint=SentenceHint(kind="sentence", text=t.hint_text or "")
                if t.hint_kind == "sentence"
                else StartersHint(kind="starters", options=t.hint_options or [""]),
                video_url=t.video_url,
                demo_reply=t.demo_reply,
                known_fixes=[KnownFixIn.model_validate(k) for k in t.known_fixes],
                min_level=t.min_level,
            )
            for t in m.turns
        ],
    )


def mood_for(level: int | None) -> Literal["calm", "worried", "upset"]:
    """Level 3 lines come from a worried parent, level 4 from an upset one."""
    return "upset" if (level or 1) >= 4 else "worried" if (level or 1) == 3 else "calm"


def to_public(m: Moment) -> MomentOut:
    """What learners see: no demo replies, no evaluator patterns."""
    return MomentOut(
        id=m.id,
        title=m.title,
        order=m.position,
        icon=m.icon,
        kind=m.kind,
        week=m.week,
        scene=m.scene,
        character=CharacterOut(
            name=m.character_name, role=m.character_role, initials=m.character_initials, poster_url=m.poster_url
        ),
        lesson=Lesson.model_validate(m.lesson) if m.lesson else None,
        turns=[
            TurnOut(
                id=t.id,
                parent_line=t.parent_line,
                hint=SentenceHint(kind="sentence", text=t.hint_text or "")
                if t.hint_kind == "sentence"
                else StartersHint(kind="starters", options=t.hint_options or [""]),
                video_url=t.video_url,
                mood=mood_for(t.min_level),
            )
            for t in m.turns
        ],
    )


def apply_moment(m: Moment, data: MomentIn) -> None:
    """Copy an edited moment onto the ORM object (turns replaced in order)."""
    m.title, m.position, m.icon, m.scene = data.title, data.order, data.icon, data.scene
    m.character_name, m.character_role = data.character.name, data.character.role
    m.character_initials, m.poster_url = data.character.initials.upper(), data.character.poster_url
    m.possessive, m.published = data.possessive, data.published
    m.kind, m.week = data.kind, data.week
    m.lesson = data.lesson.model_dump(by_alias=True) if data.lesson else None
    existing = {t.id: t for t in m.turns}
    turns: list[Turn] = []
    for i, t in enumerate(data.turns):
        row = existing.get(t.id) or Turn(id=t.id)
        row.position = i
        row.parent_line = t.parent_line
        row.hint_kind = t.hint.kind
        row.hint_text = t.hint.text if isinstance(t.hint, SentenceHint) else None
        row.hint_options = t.hint.options if isinstance(t.hint, StartersHint) else None
        row.video_url = t.video_url
        row.demo_reply = t.demo_reply
        row.known_fixes = [k.model_dump() for k in t.known_fixes]
        row.min_level = t.min_level
        turns.append(row)
    m.turns = turns


def load_file(path: Path) -> list[MomentIn]:
    raw: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return [MomentIn.model_validate(m) for m in raw["moments"]]


def file_version(path: Path) -> int:
    raw: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    return int(raw.get("version", 1))


async def published_moments(db: AsyncSession) -> list[Moment]:
    rows = await db.scalars(
        select(Moment).where(Moment.published.is_(True)).options(selectinload(Moment.turns)).order_by(Moment.position)
    )
    return list(rows)


async def all_moments(db: AsyncSession) -> list[Moment]:
    rows = await db.scalars(select(Moment).options(selectinload(Moment.turns)).order_by(Moment.position))
    return list(rows)


CONTENT_VERSION_KEY = "content_version"


async def seed_if_empty(db: AsyncSession, path: Path) -> int:
    if await db.scalar(select(func.count()).select_from(Moment)):
        return 0
    moments = load_file(path)
    for data in moments:
        m = Moment(id=data.id, turns=[])
        apply_moment(m, data)
        db.add(m)
    db.add(AppSetting(key=CONTENT_VERSION_KEY, value=file_version(path)))
    await db.flush()
    return len(moments)
