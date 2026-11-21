"""Serves the built React app. Learner pages need the session cookie; the admin console
(/admin) loads freely and authenticates through its own API."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Request, Response
from fastapi.responses import FileResponse

from ..deps import DB, learner_from_cookie, state
from .entry import denied_page
from .pages import message_page

router = APIRouter(include_in_schema=False)

# Root files from public/ (the AudioWorklet must be served as JavaScript to load).
_PUBLIC_FILES = {
    "favicon.svg": None,
    "robots.txt": None,
    "pcm-recorder-worklet.js": "text/javascript",
    "sw.js": "text/javascript",
}
_ASSET_CACHE = "public, max-age=31536000, immutable"


def _index(dist: Path) -> Response:
    index = dist / "index.html"
    if not index.exists():
        return message_page(503, "App not built", "Run `python run.py --prod` (or `npm run build`) first.")
    return FileResponse(index, headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})


@router.get("/assets/{path:path}")
async def assets(path: str, request: Request) -> Response:
    dist = state(request).settings.frontend_dist.resolve()
    file = (dist / "assets" / path).resolve()
    if not file.is_file() or (dist / "assets") not in file.parents:  # no path traversal
        return Response(status_code=404)
    return FileResponse(file, headers={"Cache-Control": _ASSET_CACHE})


@router.get("/admin")
@router.get("/admin/{path:path}")
async def admin_console(request: Request) -> Response:
    return _index(state(request).settings.frontend_dist)


@router.get("/{path:path}")
async def app_page(path: str, request: Request, db: DB) -> Response:
    dist = state(request).settings.frontend_dist.resolve()
    if path in _PUBLIC_FILES and (dist / path).is_file():
        # The service worker must be re-checked on every visit so updates roll out.
        cache = "no-cache" if path == "sw.js" else "public, max-age=3600"
        return FileResponse(dist / path, media_type=_PUBLIC_FILES[path], headers={"Cache-Control": cache})
    if path.startswith("api/"):
        return Response('{"detail":"Not Found"}', status_code=404, media_type="application/json")
    if await learner_from_cookie(request, db) is None:
        return denied_page()
    return _index(dist)
