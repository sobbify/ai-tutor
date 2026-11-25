"""Liveness / readiness for Docker, Kubernetes or a load balancer."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response
from sqlalchemy import text

from .. import __version__
from ..deps import state

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health() -> dict[str, object]:
    return {"ok": True, "version": __version__}


@router.get("/ready")
async def ready(request: Request, response: Response) -> dict[str, object]:
    st = state(request)
    try:
        async with st.db.engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 - report "unavailable", never leak
        response.status_code = 503
        return {"ok": False, "database": "unavailable"}
    return {
        "ok": True,
        "database": "ok",
        "database_kind": st.db.engine.dialect.name,  # "postgresql" in production
        "evaluator": st.evaluator.name,
    }
