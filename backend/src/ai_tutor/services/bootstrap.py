"""First admin for container deployments, from ADMIN_BOOTSTRAP_USERNAME / ADMIN_BOOTSTRAP_PASSWORD."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..logs import log
from ..models import AdminUser
from ..security.passwords import hash_password, password_problem


async def bootstrap_admin(session: AsyncSession, username: str, password: str) -> bool:
    """Create the first admin when there is none yet. Never touches an existing admin."""
    username = username.strip()
    if not username or not password:
        return False
    if await session.scalar(select(func.count()).select_from(AdminUser)):
        return False
    if problem := password_problem(password):
        log.error("admin_bootstrap_skipped", reason=problem)
        return False
    session.add(AdminUser(username=username, password_hash=hash_password(password)))
    log.info("admin_bootstrapped", username=username)
    return True
