"""Gemini voice endpoint and the realtime practice WebSocket, with fake Gemini Live services."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from ai_tutor.config import Settings
from ai_tutor.main import create_app
from ai_tutor.schemas import GrammarFix
from ai_tutor.services.audio import pcm_to_wav, plausible_duration, similarity, trim_silence, wav_to_pcm
from ai_tutor.services.evaluator import Evaluation
from ai_tutor.services.listen import LiveEvent, LiveSpec, evaluation_from_args, story_from_args
from ai_tutor.services.voice import VoiceProfile, VoiceUnavailable

from .conftest import CSRF, enter, play_through

ORIGIN = {"origin": "http://testserver"}
FRAME = b"\x10\x00" * 640  # 40 ms of PCM16 @ 16 kHz


class FakeSynth:
    name = "fake"

    def __init__(self, fail: bool = False) -> None:
        self.calls: list[tuple[str, VoiceProfile]] = []
        self.fail = fail

    async def synthesize(self, text: str, profile: VoiceProfile) -> bytes:
        self.calls.append((text, profile))
        if self.fail:
            raise VoiceUnavailable("down")
        return b"\x00\x10" * 2400


class FakeSession:
    def __init__(self, events: list[LiveEvent]) -> None:
        self._events = events
        self.audio = 0
        self.finished = asyncio.Event()

    async def send_audio(self, pcm: bytes) -> None:
        self.audio += len(pcm)

    async def finish(self) -> None:
        self.finished.set()

    async def events(self) -> AsyncIterator[LiveEvent]:
        for e in self._events:
            if isinstance(e, Evaluation):
                await self.finished.wait()  # like Gemini: the result comes after Stop
            yield e


class FakeListener:
    name = "fake"

    def __init__(self, events: list[LiveEvent], broken: bool = False) -> None:
        self._events = events
        self.broken = broken
        self.sessions: list[FakeSession] = []
        self.specs: list[LiveSpec] = []

    @asynccontextmanager
    async def open(self, spec: LiveSpec) -> AsyncIterator[FakeSession]:
        if self.broken:
            raise ConnectionError("no live")
        self.specs.append(spec)
        s = FakeSession(self._events)
        self.sessions.append(s)
        yield s


def make_client(settings: Settings, synth: FakeSynth | None, listener: FakeListener | None) -> TestClient:
    return TestClient(create_app(settings, audio=(synth, listener)), base_url="http://testserver")


@pytest.fixture
def synth() -> FakeSynth:
    return FakeSynth()


@pytest.fixture
def audio_client(settings: Settings, synth: FakeSynth) -> Iterator[TestClient]:
    listener = FakeListener(["Good morning. ", "Don’t worry, ", "she settle quickly."])  # captions, no result
    with make_client(settings, synth, listener) as c:
        enter(c)
        c.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF)
        yield c


# ---- helpers ------------------------------------------------------------------------------------


def test_pcm_helpers() -> None:
    pcm = b"\x00\x00" * 4000 + b"\xff\x7f" * 100 + b"\x00\x00" * 4000
    wav = pcm_to_wav(pcm, 16_000)
    assert wav[:4] == b"RIFF" and wav_to_pcm(wav) == (pcm, 16_000)
    trimmed = trim_silence(pcm, 16_000, pad_ms=10)
    assert len(trimmed) == (100 + 2 * 160) * 2
    assert similarity("Good morning, Miss Anita!", "good morning miss anita") == 1.0
    assert similarity("Good morning, Miss Anita!", "Hello! Good morning, Miss Anita, how are you?") < 0.9
    assert similarity("Don't worry, she settle quickly.", "Don't worry, she settlequickly.") == 1.0
    assert plausible_duration("Will she be okay?", 1200) and not plausible_duration("Will she be okay?", 9000)


def test_tool_arguments_are_validated() -> None:
    ok = evaluation_from_args(
        {
            "heard": True,
            "transcript": " She settle. ",
            "positives": ["Kind", ""],
            "fix_wrong": "settle",
            "fix_better": "She will settle.",
            "category": "Verb tense",
        }
    )
    assert ok == Evaluation(
        heard=True,
        transcript="She settle.",
        positives=["Kind"],
        fix=GrammarFix(wrong="settle", better="She will settle."),
        category="tense",
    )
    odd = evaluation_from_args(
        {"heard": True, "transcript": "x y", "positives": ["Kind"], "fix_better": "X y.", "category": "spelling!"}
    )
    assert odd is not None and odd.category == "grammar"  # unknown labels never reach the UI
    assert evaluation_from_args({"heard": False, "transcript": "", "positives": ["x"]}) == Evaluation(
        heard=False, transcript="", positives=[], fix=None
    )
    assert evaluation_from_args({"heard": True, "transcript": "Hi there", "positives": "nope"}) is None
    signals = evaluation_from_args(
        {
            "heard": True,
            "transcript": "Um hello",
            "positives": ["Kind"],
            "fillers": 2,
            "answered": True,
            "polite": "yes",
        }
    )
    assert signals is not None and signals.fillers == 2 and signals.answered is True and signals.polite is None
    story = story_from_args(
        {"heard": True, "transcript": "A girl named Asha cried.", "positives": ["Clear"], "better_line": "She is fine."}
    )
    assert story is not None and "Asha" not in story.transcript and story.better_line == "She is fine."


def test_worklet_is_served_as_javascript(client: TestClient) -> None:
    r = client.get("/pcm-recorder-worklet.js")  # AudioWorklet modules must not come back as the SPA's HTML
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/javascript")


# ---- voice ----------------------------------------------------------------------------------------


def test_voice_speaks_known_lines_only_and_caches(audio_client: TestClient, synth: FakeSynth) -> None:
    moment = audio_client.get("/api/tutor/moments/morning-greeting").json()
    line = moment["turns"][0]["parentLine"]
    r = audio_client.post("/api/tutor/voice", json={"text": line}, headers=CSRF)
    assert r.status_code == 200 and r.headers["content-type"] == "audio/wav" and r.content[:4] == b"RIFF"
    assert r.headers["cache-control"] == "no-store"
    again = audio_client.post("/api/tutor/voice", json={"text": line}, headers=CSRF)
    assert again.content == r.content and len(synth.calls) == 1  # served from the disk cache
    assert synth.calls[0][1].voice == "Kore"

    hint = next(t["hint"]["text"] for t in moment["turns"] if t["hint"]["kind"] == "sentence")
    assert audio_client.post("/api/tutor/voice", json={"text": hint}, headers=CSRF).status_code == 200
    assert synth.calls[-1][1].voice == "Aoede"

    # Not something the app shows this learner → not a general text-to-speech service
    assert audio_client.post("/api/tutor/voice", json={"text": "Say anything I want"}, headers=CSRF).status_code == 404
    assert audio_client.post("/api/tutor/voice", json={"text": "x" * 401}, headers=CSRF).status_code == 422
    assert audio_client.post("/api/tutor/voice", json={"text": line}).status_code == 403  # CSRF header


def test_voice_allows_own_grammar_fixes(audio_client: TestClient) -> None:
    r = audio_client.post(
        "/api/tutor/moments/morning-greeting/replies",
        data={"turn_id": "mg-1", "transcript": "Good morning. Don’t worry, she settle quickly."},
        headers=CSRF,
    ).json()
    better = r["feedback"]["fix"]["better"]
    assert audio_client.post("/api/tutor/voice", json={"text": better}, headers=CSRF).status_code == 200


def test_voice_needs_session_and_reports_unavailable(settings: Settings) -> None:
    with make_client(settings, FakeSynth(fail=True), None) as c:
        assert c.post("/api/tutor/voice", json={"text": "hi"}, headers=CSRF).status_code == 403
        enter(c)
        line = c.get("/api/tutor/moments/morning-greeting").json()["turns"][0]["parentLine"]
        assert c.post("/api/tutor/voice", json={"text": line}, headers=CSRF).status_code == 503
    with make_client(settings, None, None) as c:  # voice switched off: no error, the browser speaks
        enter(c)
        assert c.post("/api/tutor/voice", json={"text": line}, headers=CSRF).status_code == 204


def test_prewarm_records_every_published_line(settings: Settings, synth: FakeSynth, tmp_path: Path) -> None:
    app = create_app(settings, audio=(synth, None))
    with TestClient(app) as c:
        st = app.state.ai_tutor
        assert c.portal is not None  # run on the app's own event loop (pooled DB connections)
        c.portal.call(st.voice.prewarm, st.db.sessionmaker)
        made = len(synth.calls)
        assert made >= 10 and len(list((tmp_path / "voice").glob("*.wav"))) == made
        c.portal.call(st.voice.prewarm, st.db.sessionmaker)
        assert len(synth.calls) == made  # nothing re-recorded


# ---- realtime practice socket -------------------------------------------------------------------


def test_socket_streams_captions_and_returns_feedback(audio_client: TestClient) -> None:
    with audio_client.websocket_connect("/ws/practice/morning-greeting", headers=ORIGIN) as ws:
        ws.send_text(json.dumps({"type": "start", "turnId": "mg-1"}))
        assert ws.receive_json() == {"type": "ready", "live": True}
        for _ in range(10):
            ws.send_bytes(FRAME)
        events = []
        ws.send_text(json.dumps({"type": "stop"}))
        while (msg := ws.receive_json())["type"] != "reply":
            events.append(msg)
    assert {"type": "live", "on": True} in events
    captions = [e["text"] for e in events if e["type"] == "caption"]
    assert captions[-1] == "Good morning. Don’t worry, she settle quickly."
    reply = msg["reply"]
    assert reply["turnId"] == "mg-1" and reply["attempt"] == 1
    assert reply["feedback"]["fix"] == {"wrong": "settle", "better": "She will settle in quickly."}
    run = audio_client.get("/api/tutor/moments/morning-greeting/run").json()
    assert run["replies"][0]["transcript"] == "Good morning. Don’t worry, she settle quickly."


def test_socket_uses_gemini_live_result(settings: Settings) -> None:
    result = Evaluation(
        heard=True,
        transcript="Good morning! She will be fine.",
        positives=["You sounded calm", "No grammar mistakes. Well said!"],
        fix=None,
    )
    listener = FakeListener(["Good morning! ", "She will be fine.", result])
    with make_client(settings, None, listener) as c:
        enter(c)
        c.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF)
        with c.websocket_connect("/ws/practice/morning-greeting", headers=ORIGIN) as ws:
            ws.send_text(json.dumps({"type": "start", "turnId": "mg-1"}))
            ws.receive_json()
            for _ in range(5):
                ws.send_bytes(FRAME)
            ws.send_text(json.dumps({"type": "stop"}))
            while (m := ws.receive_json())["type"] != "reply":
                pass
        assert m["reply"]["feedback"] == {
            "heard": True,
            "positives": result.positives,
            "fix": None,
            "tip": None,
            "category": None,
            "moreFixes": [],
            "corrected": None,
        }
        assert (
            listener.specs[0].tool_name == "give_feedback"
            and "Good morning, Priya ma’am" in listener.specs[0].prompt
            and listener.sessions[0].audio == 5 * len(FRAME)
        )
        assert listener.sessions[0].finished.is_set()
    from .conftest import add_admin  # stored like any reply, marked as checked live

    add_admin(settings)
    with TestClient(create_app(settings, audio=(None, None)), base_url="http://testserver") as admin:
        admin.post("/api/admin/login", json={"username": "ops", "password": "Correct-Horse-9-battery"}, headers=CSRF)
        replies = admin.get("/api/admin/replies").json()
    assert replies["items"][0]["evaluator"] == "gemini-live"


def test_socket_without_live_still_checks_the_audio(settings: Settings) -> None:
    with make_client(settings, None, FakeListener([], broken=True)) as c:
        enter(c)
        c.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF)
        with c.websocket_connect("/ws/practice/morning-greeting", headers=ORIGIN) as ws:
            ws.send_text(json.dumps({"type": "start", "turnId": "mg-1"}))
            assert ws.receive_json()["type"] == "ready"
            ws.send_bytes(FRAME)
            ws.send_text(json.dumps({"type": "stop"}))
            msgs = []
            while (m := ws.receive_json())["type"] != "reply":
                msgs.append(m)
        assert {"type": "live", "on": False} in msgs
        assert m["reply"]["feedback"]["heard"] is True  # rules evaluator: audio → demo reply


def test_socket_security(audio_client: TestClient) -> None:
    for headers in ({}, {"origin": "https://evil.example"}):
        with (
            pytest.raises(WebSocketDisconnect) as exc,
            audio_client.websocket_connect("/ws/practice/morning-greeting", headers=headers),
        ):
            pass
        assert exc.value.code == 1008
    audio_client.cookies.clear()  # no session cookie
    with (
        pytest.raises(WebSocketDisconnect) as exc,
        audio_client.websocket_connect("/ws/practice/morning-greeting", headers=ORIGIN),
    ):
        pass
    assert exc.value.code == 1008


@pytest.mark.parametrize(
    ("first", "code"),
    [
        ({"type": "start", "turnId": "mg-2"}, "conflict"),
        ({"type": "start", "turnId": ""}, "bad_request"),
        ({"type": "hello"}, "bad_request"),
    ],
)
def test_socket_rejects_bad_starts(audio_client: TestClient, first: dict[str, str], code: str) -> None:
    with audio_client.websocket_connect("/ws/practice/morning-greeting", headers=ORIGIN) as ws:
        ws.send_text(json.dumps(first))
        assert ws.receive_json()["code"] == code


def test_socket_cancel_and_oversized_frames_store_nothing(audio_client: TestClient) -> None:
    with audio_client.websocket_connect("/ws/practice/morning-greeting", headers=ORIGIN) as ws:
        ws.send_text(json.dumps({"type": "start", "turnId": "mg-1"}))
        ws.receive_json()
        ws.send_bytes(FRAME)
        ws.send_text(json.dumps({"type": "cancel"}))
    with audio_client.websocket_connect("/ws/practice/morning-greeting", headers=ORIGIN) as ws:
        ws.send_text(json.dumps({"type": "start", "turnId": "mg-1"}))
        ws.receive_json()
        ws.send_bytes(b"\x00" * (17 * 1024))
        while (m := ws.receive_json())["type"] != "error":
            pass
        assert m["code"] == "bad_request"
    assert audio_client.get("/api/tutor/moments/morning-greeting/run").json()["replies"] == []


def test_socket_after_completion_is_a_conflict(audio_client: TestClient) -> None:
    play_through(audio_client, "morning-greeting")
    with audio_client.websocket_connect("/ws/practice/morning-greeting", headers=ORIGIN) as ws:
        ws.send_text(json.dumps({"type": "start", "turnId": "mg-1"}))
        assert ws.receive_json()["code"] == "conflict"


def test_grounding_spots_invented_transcripts() -> None:
    from ai_tutor.services.listen import grounding

    assert grounding("Kabir ate his lunch very nicely today.", "Hmm.") == "silence"
    assert grounding("Kabir ate his lunch very nicely today.", "") == "ok"  # no captions to compare
    assert grounding("Yes, he eat all his lunch today.", "Yes he eat all his lunch today") == "ok"
    assert grounding("The school trip is on Monday morning.", "She cried a little bit") == "doubtful"
    assert grounding("Okay ma'am.", "um") == "ok"  # too short to judge


def test_socket_drops_a_result_that_was_never_said(settings: Settings) -> None:
    invented = Evaluation(
        heard=True,
        transcript="Good morning, she will settle in quickly today.",
        positives=["You sounded calm", "No grammar mistakes. Well said!"],
        fix=None,
    )
    listener = FakeListener(["Hmm.", invented])  # Gemini's own captions heard only a filler sound
    with make_client(settings, None, listener) as c:
        enter(c)
        c.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF)
        with c.websocket_connect("/ws/practice/morning-greeting", headers=ORIGIN) as ws:
            ws.send_text(json.dumps({"type": "start", "turnId": "mg-1"}))
            ws.receive_json()
            ws.send_bytes(FRAME)
            ws.send_text(json.dumps({"type": "stop"}))
            while (m := ws.receive_json())["type"] != "reply":
                pass
        assert m["reply"]["feedback"]["heard"] is False
        assert c.get("/api/tutor/moments/morning-greeting/run").json()["turnIndex"] == 0


def test_evaluator_falls_back_to_the_next_model_when_one_is_used_up() -> None:
    from types import SimpleNamespace

    from ai_tutor.services.evaluator import EvaluationUnavailable, GeminiEvaluator, LineContext
    from ai_tutor.services.keys import model_list

    assert model_list(" gemini-flash-latest , gemini-flash-lite-latest,") == [
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
    ]
    good = Evaluation(
        heard=True, transcript="He ate his lunch.", positives=["Clear", "No grammar mistakes. Well said!"], fix=None
    )
    calls: list[str] = []

    class Models:
        async def generate_content(self, *, model: str, contents: object, config: object) -> object:
            calls.append(model)
            if model == "used-up":
                raise RuntimeError("429 RESOURCE_EXHAUSTED")
            return SimpleNamespace(parsed=good, text=good.model_dump_json())

    class Pool:
        def candidates(self) -> list[object]:
            return [SimpleNamespace(label="k1")]

        def client(self, cand: object) -> object:
            return SimpleNamespace(aio=SimpleNamespace(models=Models()))

        def mark_good(self, cand: object) -> None: ...

        def mark_bad(self, cand: object) -> None: ...

    ctx = LineContext(
        scene="s", character_name="Kabir's father", possessive="his", parent_line="Did he eat?", model_reply="Yes."
    )
    ev = GeminiEvaluator(Pool(), "used-up,backup")  # type: ignore[arg-type]
    result = asyncio.run(ev.evaluate(ctx, audio=None, mime_type=None, transcript_hint="He ate his lunch."))
    assert result.heard and calls == ["used-up", "backup"]
    with pytest.raises(EvaluationUnavailable):
        asyncio.run(GeminiEvaluator(Pool(), "used-up").evaluate(ctx, audio=None, mime_type=None, transcript_hint="x y"))  # type: ignore[arg-type]
