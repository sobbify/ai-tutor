"""Realtime capture over WebSockets (client: src/hooks/useLiveReply.ts).

``/ws/practice/{moment}`` — a reply to the current line:

    client → {"type":"start","turnId":"..."}            first message, within 10 s
    server → {"type":"ready","live":true|false}         start streaming
    client → binary PCM16 mono 16 kHz frames            while she speaks (≤ 16 KiB each)
    server → {"type":"live","on":true|false}            Gemini Live connected / unavailable
    server → {"type":"caption","text":"..."}            running transcript, when Gemini sends one
    client → {"type":"stop"} | {"type":"cancel"}
    server → {"type":"reply","reply":{...Reply}}        then closes (1000)
    server → {"type":"error","code":"...","message":"..."} then closes

``/ws/story`` — "Tell me what happened": the same, with ``{"type":"start"}`` and a
``{"type":"story","story":{...Story}}`` result.

Security: same checks as the HTTP API — Origin must be this site (or an allowed/embedding origin),
the HttpOnly learner cookie must be valid and she must have accepted how ELSA works; results are
rate-limited per learner, the stream is size-capped, and at most two sockets per learner are open.
Audio and transcripts are never logged.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections import Counter
from typing import Any
from urllib.parse import urlsplit

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, status
from starlette.websockets import WebSocketState

from ..deps import AppState, learner_for_token
from ..logs import log
from ..models import Learner
from ..services.audio import LISTEN_RATE, pcm_to_wav
from ..services.evaluator import Evaluation, EvaluationUnavailable, Evaluator
from ..services.journey import Journey
from ..services.learner import save_story
from ..services.listen import Listener, LiveSpec, PresetEvaluator, grounding, reply_spec, story_spec
from ..services.story import StoryResult

router = APIRouter()

MAX_FRAME = 16 * 1024
START_TIMEOUT = 10.0
LIVE_GRACE = 8.0  # after Stop, wait this long at most for Gemini Live's result (usually ~1 s)
MAX_SOCKETS_PER_LEARNER = 2
_open_sockets: Counter[int] = Counter()

POLICY_VIOLATION = 1008
TRY_AGAIN_LATER = 1013


def origin_allowed(ws: WebSocket, st: AppState) -> bool:
    origin = ws.headers.get("origin")
    if not origin:
        return False  # browsers always send Origin on WebSockets; refuse anything else
    if origin in st.settings.allowed_origins or origin in st.settings.embed_origins:
        return True
    return urlsplit(origin).netloc == ws.headers.get("host")


async def _admit(ws: WebSocket) -> tuple[AppState, int] | None:
    st: AppState = ws.app.state.ai_tutor
    settings = st.settings
    if not origin_allowed(ws, st):
        await ws.close(code=POLICY_VIOLATION)
        return None
    async with st.db.sessionmaker() as db:
        learner = await learner_for_token(ws.cookies.get(settings.session_cookie), settings, db)
        await db.commit()
    if learner is None:
        await ws.close(code=POLICY_VIOLATION)
        return None
    if _open_sockets[learner.id] >= MAX_SOCKETS_PER_LEARNER:
        await ws.close(code=TRY_AGAIN_LATER)
        return None
    return st, learner.id


async def _serve(ws: WebSocket, bridge_cls: type[Bridge], moment_id: str | None) -> None:
    admitted = await _admit(ws)
    if admitted is None:
        return
    st, learner_id = admitted
    _open_sockets[learner_id] += 1
    try:
        await ws.accept()
        await bridge_cls(ws, st, learner_id, moment_id).run()
    except WebSocketDisconnect:
        pass
    finally:
        _open_sockets[learner_id] -= 1
        if _open_sockets[learner_id] <= 0:
            del _open_sockets[learner_id]


@router.websocket("/ws/practice/{moment_id}")
async def practice_socket(ws: WebSocket, moment_id: str) -> None:
    if len(moment_id) > 64:
        await ws.close(code=POLICY_VIOLATION)
        return
    await _serve(ws, ReplyBridge, moment_id)


@router.websocket("/ws/story")
async def story_socket(ws: WebSocket) -> None:
    await _serve(ws, StoryBridge, None)


class ClientError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


HTTP_ERRORS = {
    status.HTTP_404_NOT_FOUND: "not_found",
    status.HTTP_409_CONFLICT: "conflict",
    status.HTTP_423_LOCKED: "locked",
    status.HTTP_428_PRECONDITION_REQUIRED: "consent_required",
    status.HTTP_502_BAD_GATEWAY: "unavailable",
}


def client_error(exc: HTTPException) -> ClientError:
    return ClientError(HTTP_ERRORS.get(exc.status_code, "server"), str(exc.detail))


class Bridge:
    """Receive her audio while she speaks, relay it to Gemini Live, then produce one result."""

    result_type = "reply"
    max_seconds_attr = "max_listen_seconds"

    def __init__(self, ws: WebSocket, st: AppState, learner_id: int, moment_id: str | None) -> None:
        self.ws = ws
        self.st = st
        self.learner_id = learner_id
        self.moment_id = moment_id
        self.listener: Listener | None = st.listener
        self.pcm = bytearray()
        self.max_bytes = int(getattr(st.settings, self.max_seconds_attr)) * LISTEN_RATE * 2
        self.caption = ""
        self.live_result: Any = None
        self.queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        self.live_done = asyncio.Event()
        self._send_lock = asyncio.Lock()

    # Subclasses: validate the start message → the Live spec; turn the captured audio into a result.
    async def prepare(self, start: dict[str, Any]) -> LiveSpec:
        raise NotImplementedError

    async def finish(self) -> dict[str, Any]:
        raise NotImplementedError

    async def send(self, payload: dict[str, Any]) -> None:
        if self.ws.client_state != WebSocketState.CONNECTED:
            return
        async with self._send_lock:
            with contextlib.suppress(RuntimeError, WebSocketDisconnect):
                await self.ws.send_text(json.dumps(payload))

    async def learner(self, db: Any) -> Learner:
        learner: Learner | None = await db.get(Learner, self.learner_id)
        if learner is None:
            raise ClientError("forbidden", "Session not available")
        return learner

    async def run(self) -> None:
        live_task: asyncio.Task[None] | None = None
        try:
            spec = await self.prepare(await self._first_message())
            if not self.st.limits["replies"].allow(f"learner:{self.learner_id}"):
                raise ClientError("rate_limited", "Too many requests. Please wait a moment and try again.")
            if self.listener is not None:
                live_task = asyncio.create_task(self._live(spec))
            await self.send({"type": "ready", "live": self.listener is not None})
            if not await self._stream():
                return  # cancelled or disconnected: nothing is stored
            self.queue.put_nowait(None)
            if live_task is not None:
                with contextlib.suppress(asyncio.TimeoutError):
                    await asyncio.wait_for(self.live_done.wait(), LIVE_GRACE)
            await self.send({"type": self.result_type, self.result_type: await self.finish()})
            await self.ws.close(code=1000)
        except ClientError as err:
            await self.send({"type": "error", "code": err.code, "message": err.message})
            with contextlib.suppress(RuntimeError):
                await self.ws.close(code=1000)
        finally:
            if live_task is not None:
                live_task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await live_task

    async def _first_message(self) -> dict[str, Any]:
        try:
            data = json.loads(await asyncio.wait_for(self.ws.receive_text(), START_TIMEOUT))
        except (asyncio.TimeoutError, ValueError, KeyError, TypeError) as exc:
            raise ClientError("bad_request", "Please try again.") from exc
        if not isinstance(data, dict) or data.get("type") != "start":
            raise ClientError("bad_request", "Please try again.")
        return data

    async def _stream(self) -> bool:
        """Receive audio until Stop (True) or cancel/disconnect (False)."""
        while True:
            msg = await self.ws.receive()
            if msg["type"] == "websocket.disconnect":
                return False
            chunk = msg.get("bytes")
            if chunk is not None:
                if len(chunk) > MAX_FRAME or len(chunk) % 2:
                    raise ClientError("bad_request", "Please try again.")
                chunk = chunk[: self.max_bytes - len(self.pcm)]
                self.pcm.extend(chunk)
                self.queue.put_nowait(chunk)
                if len(self.pcm) >= self.max_bytes:
                    return True  # the longest reply we accept: finish it like Stop
                continue
            try:
                kind = json.loads(msg.get("text") or "{}").get("type")
            except (ValueError, AttributeError):
                kind = None
            if kind == "stop":
                return True
            if kind == "cancel":
                with contextlib.suppress(RuntimeError):
                    await self.ws.close(code=1000)
                return False

    async def _live(self, spec: LiveSpec) -> None:
        assert self.listener is not None
        try:
            async with self.listener.open(spec) as session:
                await self.send({"type": "live", "on": True})

                async def pump() -> None:
                    while (chunk := await self.queue.get()) is not None:
                        await session.send_audio(chunk)
                    await session.finish()

                pumper = asyncio.create_task(pump())
                try:
                    async for event in session.events():
                        if isinstance(event, str):
                            self.caption = f"{self.caption}{event}"
                            await self.send({"type": "caption", "text": self.caption.strip()})
                        else:
                            self.live_result = event
                            break
                finally:
                    pumper.cancel()
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - Live is the fast path; the audio is still checked
            log.warning("listen_unavailable", error=type(exc).__name__)
            await self.send({"type": "live", "on": False})
        finally:
            self.live_done.set()

    def wav(self) -> bytes | None:
        return pcm_to_wav(bytes(self.pcm), LISTEN_RATE) if self.pcm else None


class ReplyBridge(Bridge):
    turn_id = ""

    async def prepare(self, start: dict[str, Any]) -> LiveSpec:
        turn_id = start.get("turnId")
        if not isinstance(turn_id, str) or not 0 < len(turn_id) <= 64 or self.moment_id is None:
            raise ClientError("bad_request", "Please try again.")
        self.turn_id = turn_id
        async with self.st.db.sessionmaker() as db:
            try:
                ctx = await self._journey(db, await self.learner(db)).line_context(self.moment_id, turn_id)
            except HTTPException as exc:
                raise client_error(exc) from None
        return reply_spec(ctx)

    def _journey(self, db: Any, learner: Learner) -> Journey:
        return Journey(db, learner, tz=self.st.settings.school_timezone)

    async def finish(self) -> dict[str, Any]:
        assert self.moment_id is not None
        audio = self.wav()
        # Gemini Live's result when it arrived in time, else the regular evaluator on the audio we
        # still hold in memory. Either way the audio is dropped when this socket closes.
        evaluator: Evaluator = self.st.evaluator
        if isinstance(self.live_result, Evaluation):
            check = grounding(self.live_result.transcript, self.caption)
            if check == "silence":
                evaluator = PresetEvaluator(Evaluation(heard=False, transcript="", positives=[], fix=None))
            elif check == "ok":
                evaluator = PresetEvaluator(self.live_result)
            else:
                log.info("listen_result_doubtful")  # no text logged
        async with self.st.db.sessionmaker() as db:
            try:
                out = await self._journey(db, await self.learner(db)).reply(
                    self.moment_id,
                    evaluator,
                    turn_id=self.turn_id,
                    audio=audio,
                    mime="audio/wav" if audio else None,
                    transcript=self.caption.strip() or None,
                )
            except HTTPException as exc:
                await db.rollback()
                raise client_error(exc) from None
            await db.commit()
        return out.model_dump(mode="json", by_alias=True)


class StoryBridge(Bridge):
    result_type = "story"
    max_seconds_attr = "max_story_seconds"

    async def prepare(self, start: dict[str, Any]) -> LiveSpec:
        async with self.st.db.sessionmaker() as db:
            if (await self.learner(db)).consented_at is None:
                raise ClientError("consent_required", "Please read and accept how ELSA works first")
        return story_spec()

    async def finish(self) -> dict[str, Any]:
        result: StoryResult | None = self.live_result if isinstance(self.live_result, StoryResult) else None
        if result is not None and result.heard and grounding(result.transcript, self.caption) != "ok":
            result = None  # names are removed from its transcript, so only re-check, never mark silent
        evaluator = "gemini-live"
        if result is None:
            evaluator = self.st.story_coach.name
            try:
                result = await self.st.story_coach.coach(
                    audio=self.wav(), mime_type="audio/wav", transcript_hint=self.caption.strip() or None
                )
            except EvaluationUnavailable:
                raise ClientError("unavailable", "Couldn’t listen to that just now. Please try again.") from None
        async with self.st.db.sessionmaker() as db:
            learner = await self.learner(db)
            out = await save_story(
                db, learner, result, typed=False, evaluator=evaluator, tz=self.st.settings.school_timezone
            )
            await db.commit()
        return out.model_dump(mode="json", by_alias=True)
