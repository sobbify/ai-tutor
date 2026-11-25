"""Settings from environment / backend/.env (never hard-code secrets)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
ROOT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "production", "test"] = "development"
    log_level: str = "INFO"
    log_json: bool = True

    # Database: SQLite by default (zero setup); PostgreSQL in production, e.g.
    # postgresql+asyncpg://tutor:secret@db:5432/tutor
    database_url: str = f"sqlite+aiosqlite:///{(BACKEND_DIR / 'data' / 'tutor.db').as_posix()}"
    db_echo: bool = False
    # Production runs on PostgreSQL only (SQLite is for local development and tests). Set this only
    # to run a production-mode check locally, never on a server.
    allow_sqlite_in_production: bool = False
    auto_migrate: bool = True  # run `alembic upgrade head` at startup (single-instance deployments)

    # Gemini (same key format as the Live tutor: JSON list, comma or newline separated)
    gemini_api_keys: str = ""
    gemini_backend: Literal["auto", "gemini", "vertex", "vertex-adc"] = "auto"
    gemini_api_version: str = "v1beta"  # google-genai 3.x defaults to v1
    # Fallback checker: a comma-separated chain, tried in order (free-tier quota is per model)
    gemini_eval_model: str = "gemini-flash-latest,gemini-flash-lite-latest"
    gemini_timeout_seconds: float = 30.0
    # "rules" = offline rule-based evaluator (tests, demos without a key)
    evaluator: Literal["gemini", "rules"] = "gemini"

    # Realtime audio (Gemini Live, native audio — same model and voices as the Live tutor)
    gemini_live_model: str = "gemini-3.8-live"
    voice_enabled: bool = True  # parent/coach lines spoken by Gemini (else the browser's voice)
    parent_voice: str = "Kore"
    coach_voice: str = "Aoede"
    voice_cache_dir: Path = BACKEND_DIR / "data" / "voice"
    voice_prewarm: bool = True  # synthesise every published line in the background at startup
    voice_rate_per_minute: int = 60
    live_listen: bool = True  # stream the teacher's reply to Gemini Live for realtime captions
    max_listen_seconds: int = 60
    max_story_seconds: int = 120  # "Tell me what happened"

    # Programme (school days, streak, nudges) run on the school's clock
    school_timezone: str = "Asia/Kolkata"
    # The host app (Buddy's World) fetches due nudges from /api/host/nudges with this bearer key.
    # Empty = the feed is off.
    host_api_key: str = ""

    # Learner sessions: the host app opens /in?uid=..&name=.. → HttpOnly cookie
    session_cookie: str = "ai_tutor_session"
    session_ttl_hours: float = 24 * 7  # sliding: renewed while the learner is active
    session_absolute_days: float = 30  # hard cap, then enter the uid again
    cookie_secure: bool | None = None  # None = auto (Secure in production)
    in_per_minute_ip: int = 30

    # Admin console (username + password)
    admin_cookie: str = "ai_tutor_admin"
    admin_session_hours: float = 8
    admin_login_per_minute_ip: int = 5
    lockout_after_failures: int = 8
    lockout_minutes: int = 15

    # Limits
    reply_rate_per_minute: int = 20
    max_audio_mb: float = 10

    allowed_origins: list[str] = Field(default_factory=list)
    # Sites allowed to show the app inside an <iframe> (e.g. the host app's web origin). Empty = never
    # framed (X-Frame-Options: DENY). When set, the session cookie becomes SameSite=None; Secure.
    embed_origins: list[str] = Field(default_factory=list)
    max_request_mb: float = 12
    frontend_dist: Path = ROOT_DIR / "dist"
    content_file: Path = ROOT_DIR / "content" / "moments.json"

    @field_validator("allowed_origins", "embed_origins", mode="before")
    @classmethod
    def _split(cls, v: object) -> object:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @field_validator("database_url", mode="before")
    @classmethod
    def _database_url(cls, v: object) -> object:
        """Accept the URL hosts hand out (postgres://…, postgresql://…?sslmode=require) and use asyncpg."""
        if not isinstance(v, str):
            return v
        url = v.strip()
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                url = "postgresql+asyncpg://" + url[len(prefix) :]
                break
        if url.startswith("postgresql+asyncpg://"):
            # asyncpg spells libpq's sslmode as ssl
            url = url.replace("sslmode=", "ssl=")
        return url

    @model_validator(mode="after")
    def _postgres_in_production(self) -> Settings:
        production = self.environment == "production" and not self.allow_sqlite_in_production
        if production and not self.database_url.startswith("postgresql"):
            raise ValueError(
                "Production needs PostgreSQL: set DATABASE_URL to postgresql://… (SQLite is for development only)."
            )
        return self

    @field_validator("school_timezone")
    @classmethod
    def _tz(cls, v: str) -> str:
        from zoneinfo import ZoneInfo

        ZoneInfo(v)  # raises for an unknown zone
        return v

    @property
    def secure_cookies(self) -> bool:
        if self.embed_origins:
            return True  # SameSite=None cookies must be Secure
        return self.environment == "production" if self.cookie_secure is None else self.cookie_secure

    @property
    def session_samesite(self) -> Literal["lax", "none"]:
        return "none" if self.embed_origins else "lax"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()
