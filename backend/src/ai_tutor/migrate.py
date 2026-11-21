"""Run Alembic migrations programmatically (startup, CLI)."""

from __future__ import annotations

from alembic import command
from alembic.config import Config

from .config import BACKEND_DIR


def alembic_config(url: str) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def upgrade_to_head(url: str) -> None:
    command.upgrade(alembic_config(url), "head")
