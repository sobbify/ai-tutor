"""Practice API used by the React app (contract: src/api/httpApi.ts). Everything is the learner's own."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile, status
from pydantic import Field

from ..deps import DB, CurrentLearner, limit, state
from ..models import Learner
from ..schemas import (
    Camel,
    CertificateOut,
    HomeOut,
    MomentOut,
    OnboardingIn,
    PhraseIn,
    PhraseOut,
    PreferencesIn,
    PreferencesOut,
    ProgressOut,
    ReplyOut,
    RunOut,
    StartRunIn,
    StoryIn,
    StoryOut,
    SummaryOut,
)
from ..services import learner as svc
from ..services.content import to_public
from ..services.evaluator import EvaluationUnavailable
from ..services.journey import Journey
from ..services.voice import VoiceUnavailable

router = APIRouter(prefix="/api/tutor", tags=["practice"])

ALLOWED_AUDIO = {"audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/aac"}
AUDIO_RESPONSES: dict[int | str, dict[str, Any]] = {200: {"content": {"audio/wav": {}}, "description": "PCM16 WAV"}}


def journey(request: Request, db: DB, learner: Learner) -> Journey:
    return Journey(db, learner, tz=state(request).settings.school_timezone)


# ---- home, onboarding, preferences --------------------------------------------------------------


@router.get("/home", response_model=HomeOut)
async def home(request: Request, db: DB, learner: CurrentLearner) -> HomeOut:
    return await svc.home(journey(request, db, learner))


@router.post("/onboarding", response_model=PreferencesOut)
async def onboarding(body: OnboardingIn, db: DB, learner: CurrentLearner) -> PreferencesOut:
    """Plain consent (FR-2) and her hardest moment (FR-5). Audio is never recorded or stored."""
    return await svc.onboard(db, learner, body)


@router.get("/preferences", response_model=PreferencesOut)
async def get_preferences(learner: CurrentLearner) -> PreferencesOut:
    return svc.preferences(learner)


@router.put("/preferences", response_model=PreferencesOut)
async def put_preferences(body: PreferencesIn, db: DB, learner: CurrentLearner) -> PreferencesOut:
    return await svc.update_preferences(db, learner, body)


@router.delete("/me/data", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_data(db: DB, learner: CurrentLearner) -> Response:
    """FR-39: delete her practice history, stories, phrasebook and hidden profile."""
    await svc.delete_my_data(db, learner)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---- moments & runs -----------------------------------------------------------------------------


@router.get("/progress", response_model=ProgressOut)
async def progress(request: Request, db: DB, learner: CurrentLearner) -> ProgressOut:
    return await journey(request, db, learner).progress()


@router.get("/moments/{moment_id}", response_model=MomentOut)
async def moment(moment_id: str, request: Request, db: DB, learner: CurrentLearner) -> MomentOut:
    return to_public(await journey(request, db, learner).moment(moment_id))


@router.get("/moments/{moment_id}/run", response_model=RunOut | None)
async def get_run(moment_id: str, request: Request, db: DB, learner: CurrentLearner) -> RunOut | Response:
    run = await journey(request, db, learner).current_run(moment_id)
    return run if run else Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/moments/{moment_id}/run", response_model=RunOut)
async def start_run(
    moment_id: str, request: Request, db: DB, learner: CurrentLearner, body: StartRunIn | None = None
) -> RunOut:
    body = body or StartRunIn()
    return await journey(request, db, learner).start(moment_id, restart=body.restart, quick=body.quick)


@router.post("/moments/{moment_id}/replies", response_model=ReplyOut)
async def submit_reply(
    moment_id: str,
    request: Request,
    db: DB,
    learner: CurrentLearner,
    turn_id: Annotated[str, Form(max_length=64)],
    transcript: Annotated[str | None, Form(max_length=2000)] = None,
    typed: Annotated[bool, Form()] = False,
    audio: Annotated[UploadFile | None, File()] = None,
) -> ReplyOut:
    """Upload path (and the typing fallback, FR-16). The realtime path is /ws/practice/{id}."""
    limit(request, "replies", f"learner:{learner.id}")
    settings = state(request).settings
    data: bytes | None = None
    mime: str | None = None
    if typed and not (transcript or "").strip():
        raise HTTPException(422, "Type your reply first")
    if audio is not None and not typed:
        mime = (audio.content_type or "").split(";")[0].strip().lower()
        if mime not in ALLOWED_AUDIO:
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Unsupported audio format")
        max_bytes = int(settings.max_audio_mb * 1024 * 1024)
        data = await audio.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "That reply is too long")
    return await journey(request, db, learner).reply(
        moment_id,
        state(request).evaluator,
        turn_id=turn_id,
        audio=data or None,
        mime=mime,
        transcript=transcript,
        typed=typed,
    )


@router.post("/moments/{moment_id}/advance", response_model=RunOut)
async def advance(moment_id: str, request: Request, db: DB, learner: CurrentLearner) -> RunOut:
    return await journey(request, db, learner).advance(moment_id)


@router.get("/moments/{moment_id}/summary", response_model=SummaryOut)
async def summary(moment_id: str, request: Request, db: DB, learner: CurrentLearner) -> SummaryOut:
    return await journey(request, db, learner).summary(moment_id)


# ---- voice ----------------------------------------------------------------------------------------


class VoiceIn(Camel):
    text: str = Field(min_length=1, max_length=400)


async def _voice(request: Request, db: DB, learner: Learner, text: str) -> Response:
    limit(request, "voice", f"learner:{learner.id}")
    service = state(request).voice
    if not service.enabled:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    profile = await service.allowed(db, learner, text)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nothing to play")
    try:
        return Response(await service.wav(text, profile), media_type="audio/wav")
    except VoiceUnavailable:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Voice is not available right now") from None


@router.post(
    "/voice",
    response_class=Response,
    responses={**AUDIO_RESPONSES, 204: {"description": "Voice is switched off on this server"}},
)
async def voice(body: VoiceIn, request: Request, db: DB, learner: CurrentLearner) -> Response:
    """A line the app shows (parent line, model reply, lesson phrase, her fixes) in Gemini's voice.

    204 = voice is switched off on this server (offline mode): the browser uses its own voice.
    """
    return await _voice(request, db, learner, body.text.strip())


# ---- phrasebook (FR-22) ---------------------------------------------------------------------------


@router.get("/phrasebook", response_model=list[PhraseOut])
async def phrasebook(db: DB, learner: CurrentLearner) -> list[PhraseOut]:
    return await svc.phrasebook(db, learner)


@router.post("/phrasebook", response_model=PhraseOut, status_code=status.HTTP_201_CREATED)
async def save_phrase(body: PhraseIn, db: DB, learner: CurrentLearner) -> PhraseOut:
    return await svc.save_phrase(db, learner, body.text, body.moment_id)


@router.delete("/phrasebook/{phrase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_phrase(phrase_id: int, db: DB, learner: CurrentLearner) -> Response:
    await db.delete(await svc.phrase(db, learner, phrase_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/phrasebook/{phrase_id}/voice", responses=AUDIO_RESPONSES, response_class=Response)
async def phrase_voice(phrase_id: int, request: Request, db: DB, learner: CurrentLearner) -> Response:
    """GET, so the service worker can keep it for offline use (the line never changes)."""
    row = await svc.phrase(db, learner, phrase_id)
    response = await _voice(request, db, learner, row.text)
    if response.status_code == status.HTTP_200_OK:
        response.headers["Cache-Control"] = "private, max-age=2592000, immutable"
    return response


# ---- "Tell me what happened" (FR-18) ---------------------------------------------------------------


@router.get("/stories", response_model=list[StoryOut])
async def stories(db: DB, learner: CurrentLearner) -> list[StoryOut]:
    return await svc.stories(db, learner)


@router.post("/stories", response_model=StoryOut)
async def tell_story(body: StoryIn, request: Request, db: DB, learner: CurrentLearner) -> StoryOut:
    """Typed version (quiet mode). Spoken stories go through /ws/story."""
    if learner.consented_at is None:
        raise HTTPException(status.HTTP_428_PRECONDITION_REQUIRED, "Please read and accept how ELSA works first")
    limit(request, "replies", f"learner:{learner.id}")
    st = state(request)
    try:
        result = await st.story_coach.coach(audio=None, mime_type=None, transcript_hint=body.text)
    except EvaluationUnavailable:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Couldn’t read that just now. Please try again.") from None
    return await svc.save_story(
        db, learner, result, typed=True, evaluator=st.story_coach.name, tz=st.settings.school_timezone
    )


@router.delete("/stories/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_story(story_id: int, db: DB, learner: CurrentLearner) -> Response:
    await svc.delete_story(db, learner, story_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---- certificate (FR-23) ---------------------------------------------------------------------------


@router.get("/certificate", response_model=CertificateOut)
async def certificate(request: Request, db: DB, learner: CurrentLearner) -> CertificateOut:
    """Only she sees it; sharing is her choice (downloaded or shared from her phone)."""
    return await svc.certificate(journey(request, db, learner))
