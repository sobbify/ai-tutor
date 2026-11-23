"""App factory: middleware (request id, security headers, CSRF guard), routes, lifespan."""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .api import admin, entry, health, host, journey, practice_ws, web
from .config import Settings, get_settings
from .db import Database
from .deps import AppState
from .logs import configure_logging, log
from .migrate import upgrade_to_head
from .security.ratelimit import RateLimiter
from .services.admin import upgrade_content
from .services.content import seed_if_empty
from .services.evaluator import Evaluator, GeminiEvaluator, RuleBasedEvaluator
from .services.keys import KeyPool, model_list, parse_keys
from .services.listen import GeminiLiveListener, Listener
from .services.story import GeminiStoryCoach, RuleBasedStoryCoach
from .services.voice import GeminiLiveSynthesizer, Synthesizer, VoiceService, cancel

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "ai-tutor"


def build_pool(settings: Settings) -> KeyPool:
    pool = KeyPool(parse_keys(settings.gemini_api_keys), settings.gemini_backend, settings.gemini_api_version)
    if settings.evaluator == "gemini" and not len(pool):
        log.warning("no_gemini_keys", hint="set GEMINI_API_KEYS in backend/.env or EVALUATOR=rules")
    return pool


def build_evaluator(settings: Settings, pool: KeyPool) -> Evaluator:
    if settings.evaluator == "rules":
        return RuleBasedEvaluator()
    return GeminiEvaluator(pool, settings.gemini_eval_model, settings.gemini_timeout_seconds)


def build_audio(settings: Settings, pool: KeyPool) -> tuple[Synthesizer | None, Listener | None]:
    """Gemini Live voice + realtime listening, when keys are configured (offline mode: neither)."""
    if settings.evaluator == "rules" or not len(pool):
        return None, None
    synth = (
        GeminiLiveSynthesizer(pool, settings.gemini_live_model, check_model=model_list(settings.gemini_eval_model)[-1])
        if settings.voice_enabled
        else None
    )
    listener = GeminiLiveListener(pool, settings.gemini_live_model) if settings.live_listen else None
    return synth, listener


def create_app(
    settings: Settings | None = None,
    *,
    evaluator: Evaluator | None = None,
    audio: tuple[Synthesizer | None, Listener | None] | None = None,
) -> FastAPI:
    """``evaluator`` / ``audio`` override the Gemini services (tests inject fakes)."""
    settings = settings or get_settings()
    configure_logging(settings.log_level, settings.log_json)
    db = Database(settings.database_url, settings.db_echo)
    pool = build_pool(settings)
    synth, listener = audio if audio is not None else build_audio(settings, pool)
    app_state = AppState(
        settings=settings,
        db=db,
        evaluator=evaluator or build_evaluator(settings, pool),
        voice=VoiceService(
            synth,
            settings.voice_cache_dir,
            parent_voice=settings.parent_voice,
            coach_voice=settings.coach_voice,
            model_tag=settings.gemini_live_model,
        ),
        story_coach=(
            RuleBasedStoryCoach()
            if settings.evaluator == "rules"
            else GeminiStoryCoach(pool, settings.gemini_eval_model)
        ),
        listener=listener,
        limits={
            "entry": RateLimiter(settings.in_per_minute_ip),
            "replies": RateLimiter(settings.reply_rate_per_minute),
            "voice": RateLimiter(settings.voice_rate_per_minute),
            "host": RateLimiter(60),
            "admin_login": RateLimiter(settings.admin_login_per_minute_ip),
        },
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if settings.environment == "test":
            await db.create_all()
        elif settings.auto_migrate:
            await asyncio.to_thread(upgrade_to_head, settings.database_url)
        async with db.sessionmaker() as session:
            seeded = await seed_if_empty(session, settings.content_file)
            upgraded = 0 if seeded else await upgrade_content(session, settings.content_file)
            await session.commit()
        log.info(
            "startup",
            version=__version__,
            env=settings.environment,
            evaluator=app_state.evaluator.name,
            voice=app_state.voice.synth.name if app_state.voice.synth else "browser",
            live_listen=app_state.listener is not None,
            seeded_moments=seeded,
            upgraded_moments=upgraded,
        )
        prewarm = (
            asyncio.create_task(app_state.voice.prewarm(db.sessionmaker))
            if settings.voice_prewarm and app_state.voice.enabled and settings.environment != "test"
            else None
        )
        yield
        await cancel(prewarm)
        await db.dispose()

    docs = settings.environment != "production"
    app = FastAPI(
        title="AI Tutor",
        version=__version__,
        lifespan=lifespan,
        docs_url="/api/docs" if docs else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if docs else None,
    )
    app.state.ai_tutor = app_state

    @app.middleware("http")
    async def guard(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        request_id = request.headers.get("x-request-id", "")[:64] or uuid.uuid4().hex
        structlog.contextvars.bind_contextvars(request_id=request_id)
        started = time.perf_counter()
        path = request.url.path
        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > settings.max_request_mb * 1024 * 1024:
            return JSONResponse({"detail": "Request too large"}, status_code=413)
        # CSRF: state-changing API calls must carry a header a cross-site form can't set,
        # and (when the browser sends it) an Origin matching this site.
        if request.method in UNSAFE and path.startswith("/api/"):
            origin = request.headers.get("origin")
            same_origin = (
                not origin
                or origin == f"{request.url.scheme}://{request.url.netloc}"
                or origin in settings.allowed_origins
            )
            if request.headers.get(CSRF_HEADER) != CSRF_VALUE or not same_origin:
                return JSONResponse({"detail": "Request blocked"}, status_code=403)
        try:
            response = await call_next(request)
        except Exception:  # noqa: BLE001 - last-resort 500 without details
            log.exception("unhandled_error", path=path)
            response = JSONResponse({"detail": "Something went wrong. Please try again."}, status_code=500)
        h = response.headers
        h["X-Request-ID"] = request_id
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("Referrer-Policy", "no-referrer")
        if settings.embed_origins:
            h.setdefault("Content-Security-Policy", "frame-ancestors 'self' " + " ".join(settings.embed_origins))
        else:
            h.setdefault("X-Frame-Options", "DENY")
            h.setdefault("Content-Security-Policy", "frame-ancestors 'none'")
        h.setdefault("Permissions-Policy", "microphone=(self), camera=(self), geolocation=()")
        h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if path.startswith("/api/"):
            h.setdefault("Cache-Control", "no-store")
        if settings.secure_cookies:
            h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        # Never log query strings (/in carries the uid and name).
        log.info(
            "request",
            method=request.method,
            path=path if not path.startswith("/in") else "/in",
            status=response.status_code,
            ms=round((time.perf_counter() - started) * 1000),
        )
        structlog.contextvars.clear_contextvars()
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        field = ".".join(str(p) for p in first.get("loc", [])[1:]) or "request"
        message = str(first.get("msg", "Invalid request")).removeprefix("Value error, ")
        return JSONResponse({"detail": f"{field}: {message}", "errors": jsonable(exc.errors())}, status_code=422)

    app.add_middleware(GZipMiddleware, minimum_size=1024)
    if settings.allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.allowed_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Content-Type", "X-Requested-With"],
        )

    app.include_router(health.router)
    app.include_router(entry.router)
    app.include_router(journey.router)
    app.include_router(practice_ws.router)
    app.include_router(host.router)
    app.include_router(admin.public)
    app.include_router(admin.router)
    app.include_router(web.router)  # last: SPA fallback
    return app


def jsonable(errors: object) -> object:
    from fastapi.encoders import jsonable_encoder

    return jsonable_encoder(errors, custom_encoder={Exception: str})
