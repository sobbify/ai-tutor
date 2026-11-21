"""Shared app state and FastAPI dependencies (DB session, learner/admin identity)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .config import Settings
from .db import Database, utcnow
from .models import AdminSession, AdminUser, Learner, LearnerSession
from .security.ratelimit import RateLimiter
from .security.tokens import hash_token
from .services.evaluator import Evaluator
from .services.listen import Listener
from .services.story import StoryCoach
from .services.voice import VoiceService


@dataclass
class AppState:
    settings: Settings
    db: Database
    evaluator: Evaluator
    voice: VoiceService
    story_coach: StoryCoach
    listener: Listener | None = None
    limits: dict[str, RateLimiter] = field(default_factory=dict)


def state(request: Request) -> AppState:
    st: AppState = request.app.state.ai_tutor
    return st


async def get_db(request: Request) -> AsyncIterator[AsyncSession]:
    async for session in state(request).db.session():
        yield session


DB = Annotated[AsyncSession, Depends(get_db)]


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def limit(request: Request, name: str, key: str) -> None:
    limiter = state(request).limits[name]
    if not limiter.allow(key):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many requests. Please wait a moment and try again.",
            headers={"Retry-After": str(limiter.retry_after(key))},
        )


# ---- learners (cookie from /in) -----------------------------------------------------------


async def learner_for_token(token: str | None, settings: Settings, db: AsyncSession) -> Learner | None:
    """Resolve a learner session cookie (HTTP requests and the practice WebSocket share this)."""
    if not token or len(token) > 200:
        return None
    now = utcnow()
    row = await db.scalar(
        select(LearnerSession)
        .where(LearnerSession.token_hash == hash_token(token), LearnerSession.expires_at > now)
        .options(selectinload(LearnerSession.learner))
    )
    if row is None:
        return None
    # Sliding expiry (bounded by the absolute cap), and last-seen, at most once a minute.
    if now - row.last_used_at > timedelta(minutes=1):
        cap = row.created_at + timedelta(days=settings.session_absolute_days)
        row.last_used_at = now
        row.expires_at = min(now + timedelta(hours=settings.session_ttl_hours), cap)
        row.learner.last_seen_at = now
    return row.learner


async def learner_from_cookie(request: Request, db: AsyncSession) -> Learner | None:
    settings = state(request).settings
    return await learner_for_token(request.cookies.get(settings.session_cookie), settings, db)


async def current_learner(request: Request, db: DB) -> Learner:
    learner = await learner_from_cookie(request, db)
    if learner is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Session not available")
    return learner


CurrentLearner = Annotated[Learner, Depends(current_learner)]


# ---- admins ---------------------------------------------------------------------------------


async def current_admin(request: Request, db: DB) -> AdminUser:
    settings = state(request).settings
    token = request.cookies.get(settings.admin_cookie)
    if token and len(token) <= 200:
        row = await db.scalar(
            select(AdminSession).where(AdminSession.token_hash == hash_token(token), AdminSession.expires_at > utcnow())
        )
        if row is not None:
            admin = await db.get(AdminUser, row.admin_id)
            if admin is not None and admin.is_active:
                return admin
            await db.execute(delete(AdminSession).where(AdminSession.token_hash == row.token_hash))
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to the admin console")


CurrentAdmin = Annotated[AdminUser, Depends(current_admin)]
