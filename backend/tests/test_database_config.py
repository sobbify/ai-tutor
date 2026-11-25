"""Production runs on PostgreSQL only; host-style URLs are accepted."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai_tutor.config import Settings


def make(**kw: object) -> Settings:
    return Settings(_env_file=None, **kw)  # type: ignore[arg-type,call-arg]


def test_production_refuses_sqlite() -> None:
    with pytest.raises(ValidationError, match="Production needs PostgreSQL"):
        make(environment="production", database_url="sqlite+aiosqlite:///x.db")
    with pytest.raises(ValidationError, match="Production needs PostgreSQL"):
        make(environment="production")  # the SQLite default
    # Development and tests may use SQLite.
    assert make(environment="development", database_url="sqlite+aiosqlite:///x.db").is_sqlite


def test_host_style_postgres_urls_use_asyncpg() -> None:
    s = make(environment="production", database_url="postgres://u:p@db.internal:5432/tutor")
    assert s.database_url == "postgresql+asyncpg://u:p@db.internal:5432/tutor" and not s.is_sqlite
    s = make(environment="production", database_url="postgresql://u:p@host/tutor?sslmode=require")
    assert s.database_url == "postgresql+asyncpg://u:p@host/tutor?ssl=require"
    s = make(environment="production", database_url="postgresql+asyncpg://u:p@db:5432/tutor")
    assert s.database_url == "postgresql+asyncpg://u:p@db:5432/tutor"
