"""Feed for the host app (Buddy's World), which sends the push notifications itself.

    GET /api/host/nudges   Authorization: Bearer <HOST_API_KEY>
    → {"nudges": [{"uid": "...", "message": "..."}]}

Call it every few minutes. Each learner is returned at most once a day, at or after the time she
chose, on school days only and never after 8 pm (FR-31 … FR-34). Off unless HOST_API_KEY is set.
"""

from __future__ import annotations

import hmac

from fastapi import APIRouter, HTTPException, Request, status

from ..deps import DB, client_ip, limit, state
from ..services.learner import due_nudges

router = APIRouter(prefix="/api/host", tags=["host app"])


@router.get("/nudges")
async def nudges(request: Request, db: DB) -> dict[str, list[dict[str, str]]]:
    settings = state(request).settings
    if not settings.host_api_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")
    limit(request, "host", f"ip:{client_ip(request)}")
    auth = request.headers.get("authorization", "")
    token = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""
    if not token or not hmac.compare_digest(token.encode(), settings.host_api_key.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid host key", headers={"WWW-Authenticate": "Bearer"})
    return {"nudges": await due_nudges(db, settings.school_timezone)}
