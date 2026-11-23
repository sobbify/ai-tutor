"""ORM models.

learners ─┬─ learner_sessions   signed-in browsers (HttpOnly cookie → token hash)
          ├─ runs ── replies    practice history (transcripts only — audio is never stored)
          ├─ practice_days      school days she practised (programme day, streak)
          ├─ moment_levels      hidden difficulty per moment (1–4)
          ├─ learner_profiles   hidden assessment — never shown to anyone
          ├─ phrasebook         lines she saved
          └─ stories            "Tell me what happened" (children's names removed)
moments ── turns                scripts, editable in the admin console
app_settings                    key/value (content version, nudge encouragement, holidays)
admin_users ─┬─ admin_sessions  database console sign-ins
             └─ audit_log       every console change
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, UTCDateTime, utcnow

TS = UTCDateTime()


class Learner(Base):
    """Someone practising. Identified by the uid they enter (no password yet) plus a display name."""

    __tablename__ = "learners"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    uid: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    # Onboarding and her own preferences (FR-2, FR-5, FR-16, FR-31)
    consented_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    hardest_moment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    quiet_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    nudge_time: Mapped[str | None] = mapped_column(String(5), nullable=True)  # "HH:MM", her local time
    last_nudged_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_encouraged_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    certificate_earned_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)

    sessions: Mapped[list[LearnerSession]] = relationship(
        back_populates="learner", cascade="all, delete-orphan", passive_deletes=True
    )
    runs: Mapped[list[Run]] = relationship(back_populates="learner", cascade="all, delete-orphan", passive_deletes=True)

    @property
    def first_name(self) -> str:
        return self.name.split()[0] if self.name.strip() else "Teacher"


class LearnerSession(Base):
    """A signed-in browser. The HttpOnly cookie holds a random token; only its SHA-256 is stored."""

    __tablename__ = "learner_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    last_used_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(TS, index=True)
    user_agent: Mapped[str] = mapped_column(String(200), default="")

    learner: Mapped[Learner] = relationship(back_populates="sessions")


class Moment(Base):
    __tablename__ = "moments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, unique=True)
    title: Mapped[str] = mapped_column(String(120))
    icon: Mapped[str] = mapped_column(String(20))
    scene: Mapped[str] = mapped_column(Text)
    character_name: Mapped[str] = mapped_column(String(80))
    character_role: Mapped[str] = mapped_column(String(40), default="Parent")
    character_initials: Mapped[str] = mapped_column(String(3))
    poster_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    possessive: Mapped[str] = mapped_column(String(3), default="her")
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    # programme = the 15-day course (by week) · anytime = rehearse on demand · baseline = first chat
    kind: Mapped[str] = mapped_column(String(12), default="programme")
    week: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lesson: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow, onupdate=utcnow)

    turns: Mapped[list[Turn]] = relationship(
        back_populates="moment", order_by="Turn.position", cascade="all, delete-orphan", passive_deletes=True
    )


class Turn(Base):
    __tablename__ = "turns"
    __table_args__ = (UniqueConstraint("moment_id", "position"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    moment_id: Mapped[str] = mapped_column(ForeignKey("moments.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    parent_line: Mapped[str] = mapped_column(Text)
    hint_kind: Mapped[str] = mapped_column(String(10))  # sentence | starters
    hint_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    hint_options: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    demo_reply: Mapped[str] = mapped_column(Text, default="")
    known_fixes: Mapped[list[dict[str, str]]] = mapped_column(JSON, default=list)
    # 1 calm · 2 surprise follow-up · 3 worried · 4 upset or fast-talking. A run at level L uses lines ≤ L.
    min_level: Mapped[int] = mapped_column(Integer, default=1)

    moment: Mapped[Moment] = relationship(back_populates="turns")


class Run(Base):
    __tablename__ = "runs"
    __table_args__ = (
        UniqueConstraint("learner_id", "moment_id", "run_number"),
        Index("ix_runs_learner_moment", "learner_id", "moment_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id", ondelete="CASCADE"))
    moment_id: Mapped[str] = mapped_column(ForeignKey("moments.id", ondelete="CASCADE"), index=True)
    run_number: Mapped[int] = mapped_column(Integer)
    turn_index: Mapped[int] = mapped_column(Integer, default=0)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    kind: Mapped[str] = mapped_column(String(8), default="full")  # full | quick ("Rehearse now")
    level: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow, onupdate=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)

    learner: Mapped[Learner] = relationship(back_populates="runs")
    replies: Mapped[list[Reply]] = relationship(
        back_populates="run", order_by="Reply.id", cascade="all, delete-orphan", passive_deletes=True
    )


class Reply(Base):
    """One heard attempt at a line. The first attempt per (run, turn) is what progress measures."""

    __tablename__ = "replies"
    __table_args__ = (UniqueConstraint("run_id", "turn_id", "attempt"), Index("ix_replies_created", "created_at"))

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    turn_id: Mapped[str] = mapped_column(String(64))
    parent_line: Mapped[str] = mapped_column(Text)  # snapshot, survives script edits
    attempt: Mapped[int] = mapped_column(Integer)
    transcript: Mapped[str] = mapped_column(Text)
    positives: Mapped[list[str]] = mapped_column(JSON, default=list)
    fix_wrong: Mapped[str | None] = mapped_column(Text, nullable=True)
    fix_better: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluator: Mapped[str] = mapped_column(String(20))
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    tip: Mapped[str | None] = mapped_column(Text, nullable=True)  # grammar micro-lesson (FR-12)
    fillers: Mapped[int | None] = mapped_column(Integer, nullable=True)  # ums/uhs, private (FR-13)
    signals: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)  # hidden assessment inputs
    typed: Mapped[bool] = mapped_column(Boolean, default=False)  # typing fallback (FR-16)
    category: Mapped[str | None] = mapped_column(String(24), nullable=True)  # kind of slip the fix is about

    run: Mapped[Run] = relationship(back_populates="replies")


class PracticeDay(Base):
    """A school day she practised (her local date). Counts programme days and the streak."""

    __tablename__ = "practice_days"

    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)


class MomentLevel(Base):
    """Hidden difficulty per learner and moment. Rises only when she's ready; never displayed."""

    __tablename__ = "moment_levels"

    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id", ondelete="CASCADE"), primary_key=True)
    moment_id: Mapped[str] = mapped_column(ForeignKey("moments.id", ondelete="CASCADE"), primary_key=True)
    level: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow, onupdate=utcnow)


class LearnerProfile(Base):
    """Hidden assessment (PRD §09): learned from normal practice, refreshed weekly, shown to no one."""

    __tablename__ = "learner_profiles"

    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id", ondelete="CASCADE"), primary_key=True)
    fluency: Mapped[float] = mapped_column(Float, default=0.0)
    grammar: Mapped[float] = mapped_column(Float, default=0.0)
    vocabulary: Mapped[float] = mapped_column(Float, default=0.0)
    listening: Mapped[float] = mapped_column(Float, default=0.0)
    intelligibility: Mapped[float] = mapped_column(Float, default=0.0)
    band: Mapped[int] = mapped_column(Integer, default=1)  # 1–4, internal only
    replies_counted: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class PhrasebookEntry(Base):
    __tablename__ = "phrasebook"
    __table_args__ = (UniqueConstraint("learner_id", "text"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(String(400))
    source: Mapped[str] = mapped_column(String(10))  # hint | fix | lesson | story
    moment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)


class Story(Base):
    """'Tell me what happened' about a real conversation. Children's names are removed before saving."""

    __tablename__ = "stories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    learner_id: Mapped[int] = mapped_column(ForeignKey("learners.id", ondelete="CASCADE"), index=True)
    transcript: Mapped[str] = mapped_column(Text)
    positives: Mapped[list[str]] = mapped_column(JSON, default=list)
    fix_wrong: Mapped[str | None] = mapped_column(Text, nullable=True)
    fix_better: Mapped[str | None] = mapped_column(Text, nullable=True)
    better_line: Mapped[str | None] = mapped_column(Text, nullable=True)
    tip: Mapped[str | None] = mapped_column(Text, nullable=True)
    fillers: Mapped[int | None] = mapped_column(Integer, nullable=True)
    typed: Mapped[bool] = mapped_column(Boolean, default=False)
    evaluator: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow, index=True)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(TS, default=utcnow, onupdate=utcnow)


class AdminUser(Base):
    """Database-console operator. Created from the command line (`ai-tutor create-admin`)."""

    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)


class AdminSession(Base):
    __tablename__ = "admin_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admin_users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(TS)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    admin_id: Mapped[int | None] = mapped_column(ForeignKey("admin_users.id", ondelete="SET NULL"), nullable=True)
    admin_username: Mapped[str] = mapped_column(String(64))  # kept if the admin is deleted
    action: Mapped[str] = mapped_column(String(64), index=True)
    target_type: Mapped[str] = mapped_column(String(32))
    target_id: Mapped[str] = mapped_column(String(128))
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(TS, default=utcnow, index=True)
