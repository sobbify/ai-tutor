"""The door: the host app opens /in?uid=..&name=..[&centre=..] → HttpOnly session cookie → bare app URL."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import ValidationError
from sqlalchemy import delete, select

from ..db import utcnow
from ..deps import DB, CurrentLearner, client_ip, limit, state
from ..logs import log
from ..models import Learner, LearnerSession
from ..schemas import EntryIn, MeOut
from ..security.tokens import hash_token, new_token
from .pages import message_page

router = APIRouter()

NO_STORE = {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"}


@router.get("/in", include_in_schema=False)
@router.get("/in/", include_in_schema=False)
async def enter(
    request: Request, db: DB, uid: str | None = None, name: str | None = None, centre: str | None = None
) -> Response:
    limit(request, "entry", client_ip(request))
    settings = state(request).settings
    try:
        entry = EntryIn(uid=uid or "", name=name or "", centre=centre or None)
    except ValidationError:
        return message_page(
            400, "Can’t open ELSA", "The app sent an invalid ID or name. Please open ELSA again from Buddy’s World."
        )

    learner = await db.scalar(select(Learner).where(Learner.uid == entry.uid))
    if learner is None:
        learner = Learner(uid=entry.uid, name=entry.name, centre=entry.centre)
        db.add(learner)
        await db.flush()
        log.info("learner_created", learner_id=learner.id)
    else:
        learner.name = entry.name
        learner.last_seen_at = utcnow()
        if entry.centre:
            learner.centre = entry.centre  # she may have moved centre; her group stays until she leaves it

    # One browser = one session: drop the cookie it already had, then issue a fresh token.
    old = request.cookies.get(settings.session_cookie)
    if old and len(old) <= 200:
        await db.execute(delete(LearnerSession).where(LearnerSession.token_hash == hash_token(old)))
    token = new_token()
    ttl = timedelta(hours=settings.session_ttl_hours)
    db.add(
        LearnerSession(
            token_hash=hash_token(token),
            learner_id=learner.id,
            expires_at=utcnow() + ttl,
            user_agent=(request.headers.get("user-agent") or "")[:200],
        )
    )
    # Housekeeping: expired sessions.
    await db.execute(delete(LearnerSession).where(LearnerSession.expires_at <= utcnow()))

    response = RedirectResponse("/", status_code=303, headers=NO_STORE)  # nothing left in the address bar
    response.set_cookie(
        settings.session_cookie,
        token,
        max_age=int(settings.session_absolute_days * 86400),
        path="/",
        httponly=True,
        secure=settings.secure_cookies,
        samesite=settings.session_samesite,  # lax: the host app navigates here; mutations are CSRF-guarded
    )
    return response


@router.get("/api/me", response_model=MeOut)
async def me(learner: CurrentLearner) -> MeOut:
    return MeOut(uid=learner.uid, name=learner.name, first_name=learner.first_name)


@router.post("/api/signout", status_code=204)
async def sign_out(request: Request, db: DB) -> Response:
    settings = state(request).settings
    token = request.cookies.get(settings.session_cookie)
    if token and len(token) <= 200:
        await db.execute(delete(LearnerSession).where(LearnerSession.token_hash == hash_token(token)))
    response = Response(status_code=204)
    response.delete_cookie(
        settings.session_cookie, path="/", httponly=True, secure=settings.secure_cookies, samesite="lax"
    )
    return response


def denied_page() -> HTMLResponse:
    return message_page(
        403,
        "Session not available",
        "This practice session has ended or expired. Please open ELSA again from Buddy’s World.",
    )
