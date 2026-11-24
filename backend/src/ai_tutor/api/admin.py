"""Admin database console API. Every route needs an admin session; every change is audited."""

from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import selectinload

from ..db import utcnow
from ..deps import DB, CurrentAdmin, client_ip, current_admin, limit, state
from ..logs import log
from ..models import AdminSession, AdminUser, AppSetting, Learner, Moment
from ..schemas import UID_PATTERN, AdminLoginIn, AdminMeOut, Camel
from ..security.passwords import hash_password, password_problem, verify_password
from ..security.tokens import hash_token, new_token
from ..services import admin as svc
from ..services.content import MomentIn, moment_from_db
from ..services.learner import ENCOURAGEMENT_KEY
from ..services.programme import HOLIDAYS_KEY

public = APIRouter(prefix="/api/admin", tags=["admin"])
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(current_admin)])

# Constant-time-ish login: verify against a dummy hash when the username doesn't exist.
_DUMMY_HASH = hash_password("not-a-real-password-0")

PageNo = Annotated[int, Query(ge=1, le=10_000)]
PageSize = Annotated[int, Query(ge=1, le=100)]


def _download(data: Any, filename: str) -> Response:
    return Response(
        json.dumps(data, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"},
    )


async def _learner(db: DB, uid: str) -> Learner:
    learner = await db.scalar(select(Learner).where(Learner.uid == uid))
    if learner is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Learner not found")
    return learner


async def _moment(db: DB, moment_id: str) -> Moment:
    m = await db.scalar(select(Moment).where(Moment.id == moment_id).options(selectinload(Moment.turns)))
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Moment not found")
    return m


# ---- auth -------------------------------------------------------------------------------------


@public.post("/login", response_model=AdminMeOut)
async def login(body: AdminLoginIn, request: Request, response: Response, db: DB) -> AdminMeOut:
    limit(request, "admin_login", client_ip(request))
    settings = state(request).settings
    admin = await db.scalar(select(AdminUser).where(func.lower(AdminUser.username) == body.username.strip().lower()))
    now = utcnow()
    if admin is not None and admin.locked_until and admin.locked_until > now:
        verify_password(body.password, _DUMMY_HASH)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong username or password")  # same answer: no enumeration
    ok = verify_password(body.password, admin.password_hash if admin else _DUMMY_HASH)
    if not admin or not ok or not admin.is_active:
        if admin is not None:
            admin.failed_logins += 1
            if admin.failed_logins >= settings.lockout_after_failures:
                admin.locked_until = now + timedelta(minutes=settings.lockout_minutes)
                admin.failed_logins = 0
            await svc.audit(db, admin, "admin.login_failed", "admin", admin.username, ip=client_ip(request))
            await db.commit()  # keep the counter even though we raise
        log.warning("admin_login_failed")
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong username or password")

    admin.failed_logins, admin.locked_until, admin.last_login_at = 0, None, now
    token = new_token()
    db.add(
        AdminSession(
            token_hash=hash_token(token),
            admin_id=admin.id,
            expires_at=now + timedelta(hours=settings.admin_session_hours),
        )
    )
    await db.execute(delete(AdminSession).where(AdminSession.expires_at <= now))
    await svc.audit(db, admin, "admin.login", "admin", admin.username, ip=client_ip(request))
    response.set_cookie(
        settings.admin_cookie,
        token,
        max_age=int(settings.admin_session_hours * 3600),
        path="/api/admin",
        httponly=True,
        secure=settings.secure_cookies,
        samesite="strict",
    )
    return AdminMeOut(username=admin.username)


@public.post("/logout", status_code=204)
async def logout(request: Request, db: DB) -> Response:
    settings = state(request).settings
    token = request.cookies.get(settings.admin_cookie)
    if token and len(token) <= 200:
        await db.execute(delete(AdminSession).where(AdminSession.token_hash == hash_token(token)))
    response = Response(status_code=204)
    response.delete_cookie(
        settings.admin_cookie, path="/api/admin", httponly=True, secure=settings.secure_cookies, samesite="strict"
    )
    return response


class SessionOut(Camel):
    username: str | None


@public.get("/session", response_model=SessionOut)
async def session(request: Request, db: DB) -> SessionOut:
    """Who is signed in, without a 401 — lets the console decide between login and dashboard quietly."""
    try:
        admin = await current_admin(request, db)
    except HTTPException:
        return SessionOut(username=None)
    return SessionOut(username=admin.username)


@router.get("/me", response_model=AdminMeOut)
async def me(admin: CurrentAdmin) -> AdminMeOut:
    return AdminMeOut(username=admin.username)


class PasswordChange(Camel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=1, max_length=200)


@router.post("/me/password", status_code=204)
async def change_password(body: PasswordChange, request: Request, db: DB, admin: CurrentAdmin) -> Response:
    if not verify_password(body.current_password, admin.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is wrong")
    if problem := password_problem(body.new_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, problem)
    admin.password_hash = hash_password(body.new_password)
    # Sign out every other session.
    token = request.cookies.get(state(request).settings.admin_cookie) or ""
    await db.execute(
        delete(AdminSession).where(AdminSession.admin_id == admin.id, AdminSession.token_hash != hash_token(token))
    )
    await svc.audit(db, admin, "admin.password_changed", "admin", admin.username)
    return Response(status_code=204)


# ---- dashboard ----------------------------------------------------------------------------------


@router.get("/stats", response_model=svc.Stats)
async def stats(db: DB) -> svc.Stats:
    return await svc.stats(db)


# ---- learners ----------------------------------------------------------------------------------


@router.get("/learners", response_model=svc.Page[svc.LearnerRow])
async def learners(
    db: DB,
    page: PageNo = 1,
    size: PageSize = 25,
    q: Annotated[str, Query(max_length=100)] = "",
    sort: svc.LearnerSort = "last_seen",
) -> svc.Page[svc.LearnerRow]:
    return await svc.list_learners(db, q.strip(), sort, page, size)


@router.get("/learners/{uid}", response_model=svc.LearnerDetail)
async def learner(uid: str, db: DB) -> svc.LearnerDetail:
    return await svc.learner_detail(db, await _learner(db, uid))


class LearnerPatch(Camel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    # Her centre (groups only mix one centre). "" clears it; leave out to keep it.
    centre: str | None = Field(default=None, max_length=64, pattern=r"^$|" + UID_PATTERN)


@router.patch("/learners/{uid}", response_model=svc.LearnerDetail)
async def update_learner(uid: str, body: LearnerPatch, db: DB, admin: CurrentAdmin) -> svc.LearnerDetail:
    learner = await _learner(db, uid)
    if body.name is not None and " ".join(body.name.split()) != learner.name:
        old = learner.name
        learner.name = " ".join(body.name.split())
        await svc.audit(db, admin, "learner.renamed", "learner", uid, before=old, after=learner.name)
    if body.centre is not None and (body.centre or None) != learner.centre:
        old_centre = learner.centre
        learner.centre = body.centre or None  # her group stays; she can leave it in the app
        await svc.audit(db, admin, "learner.centre_changed", "learner", uid, before=old_centre, after=learner.centre)
    return await svc.learner_detail(db, learner)


class ResetIn(Camel):
    moment_id: str | None = None


@router.post("/learners/{uid}/reset", status_code=200)
async def reset(uid: str, body: ResetIn, db: DB, admin: CurrentAdmin) -> dict[str, int]:
    learner = await _learner(db, uid)
    n = await svc.reset_progress(db, learner, body.moment_id)
    await svc.audit(db, admin, "learner.progress_reset", "learner", uid, moment_id=body.moment_id, runs_deleted=n)
    return {"runsDeleted": n}


@router.post("/learners/{uid}/signout", status_code=200)
async def sign_out(uid: str, db: DB, admin: CurrentAdmin) -> dict[str, int]:
    n = await svc.sign_out_learner(db, await _learner(db, uid))
    await svc.audit(db, admin, "learner.signed_out", "learner", uid, sessions=n)
    return {"sessionsEnded": n}


@router.delete("/learners/{uid}", status_code=204)
async def delete_learner(uid: str, db: DB, admin: CurrentAdmin, confirm: Annotated[str, Query()] = "") -> Response:
    learner = await _learner(db, uid)
    if confirm != uid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Type the learner's ID to confirm")
    await db.delete(learner)
    await svc.audit(db, admin, "learner.deleted", "learner", uid, name=learner.name)
    return Response(status_code=204)


@router.get("/learners/{uid}/export")
async def export_learner(uid: str, db: DB, admin: CurrentAdmin) -> Response:
    learner = await _learner(db, uid)
    await svc.audit(db, admin, "learner.exported", "learner", uid)
    return _download(await svc.learner_export(db, learner), f"learner-{uid}.json")


# ---- replies -----------------------------------------------------------------------------------


@router.get("/replies", response_model=svc.Page[svc.ReplyRow])
async def replies(
    db: DB,
    page: PageNo = 1,
    size: PageSize = 25,
    q: Annotated[str, Query(max_length=100)] = "",
    moment: Annotated[str | None, Query(max_length=64)] = None,
    outcome: Literal["all", "fix", "clean"] = "all",
    learner: Annotated[str | None, Query(max_length=128)] = None,
) -> svc.Page[svc.ReplyRow]:
    return await svc.list_replies(
        db, q=q.strip(), moment=moment or None, outcome=outcome, learner_uid=learner or None, page=page, size=size
    )


# ---- content ------------------------------------------------------------------------------------


@router.get("/moments", response_model=list[svc.MomentRow])
async def moments(db: DB) -> list[svc.MomentRow]:
    return await svc.list_moments(db)


@router.get("/moments/{moment_id}", response_model=MomentIn)
async def get_moment(moment_id: str, db: DB) -> MomentIn:
    return moment_from_db(await _moment(db, moment_id))


@router.put("/moments/{moment_id}", response_model=MomentIn)
async def update_moment(moment_id: str, body: MomentIn, db: DB, admin: CurrentAdmin) -> MomentIn:
    if body.id != moment_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A moment's id can't be changed")
    m = await svc.save_moment(db, await _moment(db, moment_id), body)
    await svc.audit(db, admin, "moment.updated", "moment", moment_id, lines=len(body.turns), published=body.published)
    return moment_from_db(await _moment(db, m.id))


@router.post("/moments", response_model=MomentIn, status_code=201)
async def create_moment(body: MomentIn, db: DB, admin: CurrentAdmin) -> MomentIn:
    if await db.get(Moment, body.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "A moment with that id already exists")
    m = await svc.save_moment(db, None, body)
    await svc.audit(db, admin, "moment.created", "moment", body.id)
    return moment_from_db(await _moment(db, m.id))


@router.delete("/moments/{moment_id}", status_code=204)
async def delete_moment(moment_id: str, db: DB, admin: CurrentAdmin, confirm: Annotated[str, Query()] = "") -> Response:
    m = await _moment(db, moment_id)
    if confirm != moment_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Type the moment's id to confirm")
    await svc.delete_moment(db, m)
    await svc.audit(db, admin, "moment.deleted", "moment", moment_id, title=m.title)
    return Response(status_code=204)


class NudgeSettings(Camel):
    """Central encouragement (at most once a week per teacher, FR-34) and school holidays (no nudges,
    and they don't count against the streak)."""

    encouragement: str = Field(default="", max_length=200)
    holidays: list[date] = Field(default_factory=list, max_length=100)


@router.get("/nudge-settings", response_model=NudgeSettings)
async def get_nudge_settings(db: DB) -> NudgeSettings:
    enc = await db.get(AppSetting, ENCOURAGEMENT_KEY)
    hol = await db.get(AppSetting, HOLIDAYS_KEY)
    return NudgeSettings(
        encouragement=str((enc.value or {}).get("text", "")) if enc and isinstance(enc.value, dict) else "",
        holidays=sorted(date.fromisoformat(d) for d in (hol.value if hol and isinstance(hol.value, list) else [])),
    )


@router.put("/nudge-settings", response_model=NudgeSettings)
async def put_nudge_settings(body: NudgeSettings, db: DB, admin: CurrentAdmin) -> NudgeSettings:
    for key, value in (
        (ENCOURAGEMENT_KEY, {"text": body.encouragement.strip()}),
        (HOLIDAYS_KEY, sorted({d.isoformat() for d in body.holidays})),
    ):
        row = await db.get(AppSetting, key)
        if row is None:
            db.add(AppSetting(key=key, value=value))
        else:
            row.value = value
    await svc.audit(db, admin, "nudges.updated", "settings", "nudges", holidays=len(body.holidays))
    await db.flush()
    return await get_nudge_settings(db)


@router.get("/content/export")
async def export_content(db: DB, admin: CurrentAdmin) -> Response:
    await svc.audit(db, admin, "content.exported", "content", "all")
    return _download(await svc.export_content(db), "moments.json")


class ContentImport(Camel):
    moments: list[MomentIn] = Field(min_length=1, max_length=100)


@router.post("/content/import")
async def import_content(body: ContentImport, db: DB, admin: CurrentAdmin) -> dict[str, int]:
    created = updated = 0
    for data in sorted(body.moments, key=lambda m: m.order):
        existing = await db.scalar(select(Moment).where(Moment.id == data.id).options(selectinload(Moment.turns)))
        await svc.save_moment(db, existing, data)
        created += existing is None
        updated += existing is not None
    await svc.audit(db, admin, "content.imported", "content", "all", created=created, updated=updated)
    return {"created": created, "updated": updated}


# ---- backup / audit / admins ------------------------------------------------------------------


@router.get("/backup")
async def backup(db: DB, admin: CurrentAdmin) -> Response:
    await svc.audit(db, admin, "backup.downloaded", "database", "all")
    return _download(await svc.backup(db), f"ai-tutor-backup-{utcnow():%Y%m%d-%H%M}.json")


@router.get("/audit", response_model=svc.Page[svc.AuditRow])
async def audit(
    db: DB, page: PageNo = 1, size: PageSize = 50, action: Annotated[str | None, Query(max_length=64)] = None
) -> svc.Page[svc.AuditRow]:
    return await svc.list_audit(db, action or None, page, size)


@router.get("/admins", response_model=list[svc.AdminRow])
async def admins(db: DB) -> list[svc.AdminRow]:
    return await svc.list_admins(db)


class AdminCreate(Camel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.@-]+$")
    password: str = Field(min_length=1, max_length=200)


@router.post("/admins", response_model=svc.AdminRow, status_code=201)
async def create_admin(body: AdminCreate, db: DB, admin: CurrentAdmin) -> svc.AdminRow:
    if problem := password_problem(body.password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, problem)
    if await db.scalar(select(AdminUser).where(func.lower(AdminUser.username) == body.username.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "That username is taken")
    new = AdminUser(username=body.username, password_hash=hash_password(body.password))
    db.add(new)
    await db.flush()
    await svc.audit(db, admin, "admin.created", "admin", body.username)
    return svc.AdminRow.model_validate(new)


@router.delete("/admins/{username}", status_code=204)
async def delete_admin(username: str, db: DB, admin: CurrentAdmin) -> Response:
    target = await db.scalar(select(AdminUser).where(AdminUser.username == username))
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admin not found")
    if target.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't remove yourself")
    await db.delete(target)
    await svc.audit(db, admin, "admin.deleted", "admin", username)
    return Response(status_code=204)
