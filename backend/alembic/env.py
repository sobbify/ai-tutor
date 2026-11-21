"""Alembic migrations (async). URL from Settings (DATABASE_URL / backend/.env)."""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.engine import Connection

from ai_tutor import models  # noqa: F401  (register tables)
from ai_tutor.config import get_settings
from ai_tutor.db import Base, make_engine

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata
URL = config.get_main_option("sqlalchemy.url") or get_settings().database_url


def run_offline() -> None:
    context.configure(url=URL, target_metadata=target_metadata, literal_binds=True, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


def _run(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=connection.dialect.name == "sqlite",  # SQLite ALTER TABLE support
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_online() -> None:
    engine = make_engine(URL)
    async with engine.connect() as conn:
        await conn.run_sync(_run)
    await engine.dispose()


if context.is_offline_mode():
    run_offline()
else:
    asyncio.run(run_online())
