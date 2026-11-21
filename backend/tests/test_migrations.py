from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from ai_tutor.db import Base
from ai_tutor.main import create_app
from ai_tutor.migrate import alembic_config, upgrade_to_head

from .conftest import ROOT, enter, make_settings, play_through


def test_migrations_match_models_and_round_trip(tmp_path: Path) -> None:
    db_file = tmp_path / "m.db"
    url = f"sqlite+aiosqlite:///{db_file.as_posix()}"
    upgrade_to_head(url)
    engine = create_engine(f"sqlite:///{db_file.as_posix()}")
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert diff == [], diff
    command.downgrade(alembic_config(url), "base")
    upgrade_to_head(url)


def test_app_auto_migrates_and_seeds(tmp_path: Path) -> None:
    settings = make_settings(tmp_path, environment="development")
    with TestClient(create_app(settings)) as c:
        enter(c)
        assert len(c.get("/api/tutor/progress").json()["moments"]) == 8


def test_newer_content_file_upgrades_an_existing_database(tmp_path: Path) -> None:
    """Databases seeded from an older moments.json pick up new scripts without losing practice."""
    import json

    old = json.loads((ROOT / "content" / "moments.json").read_text(encoding="utf-8"))
    greeting = next(m for m in old["moments"] if m["id"] == "morning-greeting")
    v1 = {"version": 1, "moments": [{**greeting, "turns": greeting["turns"][:2]}]}
    v1_file = tmp_path / "v1.json"
    v1_file.write_text(json.dumps(v1), encoding="utf-8")
    settings = make_settings(tmp_path, environment="development", content_file=v1_file)
    with TestClient(create_app(settings)) as c:
        enter(c)
        play_through(c, "morning-greeting")
        assert len(c.get("/api/tutor/progress").json()["moments"]) == 1
    settings = make_settings(tmp_path / "again", environment="development", database_url=settings.database_url)
    with TestClient(create_app(settings)) as c:
        enter(c)
        moments = {m["id"]: m for m in c.get("/api/tutor/progress").json()["moments"]}
        assert len(moments) == 8 and moments["morning-greeting"]["timesPractised"] == 1
