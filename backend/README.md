# AI Tutor backend

FastAPI (async) + SQLAlchemy 2.0 + Alembic. It runs on **SQLite** by default, with nothing to
set up, or on **PostgreSQL** through `DATABASE_URL`. Audio is realtime, like the Live tutor:
the teacher's reply streams to **Gemini Live** while they speak (feedback ~1 s after Stop), and the
parent's lines are spoken in Gemini's native voices. Keys rotate through a pool, as in the Live
tutor; without keys an offline rule-based checker and the browser's voice take over.

**Audio is never stored.** The teacher's voice streams to Gemini Live (and, if Live is slow, the
same audio from memory goes to the fallback evaluator); it is dropped when the request or socket
ends. Only transcripts, feedback and the private signals are saved.

### Realtime audio

- **Listening** — `WS /ws/practice/{moment}`: the browser's AudioWorklet sends PCM16 16 kHz frames
  while the teacher speaks; the server relays them to Gemini Live (`gemini-3.8-live`, manual
  activity start/end, input transcription). On Stop, Gemini answers through a `give_feedback`
  tool call (about 1 s), which is validated and stored like any reply. If Live is unreachable or
  slow, the recorded audio goes to the regular evaluator instead — results are never invented.
- **Voice** — `POST /api/tutor/voice`: parent lines (voice `Kore`) and model replies / grammar
  fixes (voice `Aoede`) performed by Gemini Live, checked word for word, cached on disk as WAV and
  pre-recorded at startup. Only text the app shows that learner can be voiced.
- **Self-test** — `ai-tutor audio-check` voices two lines and streams one through the listener
  against real Gemini, printing the timings.

```
src/ai_tutor/
├── main.py          app factory: middleware (request id, CSRF, security headers, size limit), routes
├── config.py        settings from env / backend/.env
├── models.py        learners, learner_sessions, moments, turns, runs, replies, admin_users, admin_sessions, audit_log
├── api/             entry (/in), journey (/api/tutor), practice_ws (/ws/practice), admin (/api/admin), health, web
├── services/        journey rules, content, admin queries, Gemini evaluator + key pool,
│                    listen (Gemini Live relay), voice (Gemini voice + cache), audio helpers,
│                    programme (days, streak, hidden levels + assessment), learner (home, phrasebook,
│                    stories, certificate, delete my data, nudges), story
├── security/        password hashing (scrypt), tokens, rate limiter
├── cli.py           ai-tutor migrate | create-admin | reset-admin-password | admin-count | seed-content | serve | audio-check
└── migrate.py       programmatic `alembic upgrade head`
alembic/versions/    migrations (0001 initial schema, 0002 ELSA MVP, 0003 transcripts only)
tests/               pytest: entry & security, journey, programme/MVP features, admin, migrations, realtime audio
```

## Run

```bash
pip install -r requirements.txt          # Python 3.12+
cp .env.example .env                     # then edit
PYTHONPATH=src python -m ai_tutor migrate
PYTHONPATH=src python -m ai_tutor create-admin <username>
PYTHONPATH=src uvicorn ai_tutor.asgi:app --port 8000
```

Or just run `python run.py` from the repo root.

## Configuration (`backend/.env` or environment)

| Setting | Default | |
| --- | --- | --- |
| `ENVIRONMENT` | `development` | `production` → Secure cookies, HSTS, no API docs |
| `DATABASE_URL` | SQLite `backend/data/tutor.db` | e.g. `postgresql+asyncpg://user:pw@host:5432/tutor` |
| `AUTO_MIGRATE` | `true` | run migrations at startup (single instance). For multiple instances, run `ai-tutor migrate` in the deploy step and set `false` |
| `EVALUATOR` | `gemini` | or `rules` (offline, for demos/tests) |
| `GEMINI_API_KEYS` | | comma-separated or JSON list; failed keys are parked, the next one is tried |
| `GEMINI_BACKEND` | `auto` | `gemini`, `vertex`, `vertex-adc` |
| `GEMINI_EVAL_MODEL` | `gemini-flash-latest,gemini-flash-lite-latest` | fallback checker; a comma-separated chain tried in order, so a model whose daily quota is used up (free tier) hands over to the next |
| `GEMINI_LIVE_MODEL` | `gemini-3.8-live` | realtime listening and the voices |
| `LIVE_LISTEN` / `VOICE_ENABLED` | `true` / `true` | realtime listening / Gemini voice (else upload + browser voice) |
| `PARENT_VOICE` / `COACH_VOICE` | `Kore` / `Aoede` | Gemini prebuilt voices |
| `VOICE_CACHE_DIR` / `VOICE_PREWARM` | `backend/data/voice` / `true` | WAV cache; record every line at startup |
| `MAX_LISTEN_SECONDS` / `VOICE_RATE_PER_MINUTE` | 60 / 60 | longest streamed reply; voice requests per learner |
| `MAX_STORY_SECONDS` | 120 | longest "Tell me what happened" |
| `SCHOOL_TIMEZONE` | `Asia/Kolkata` | programme days, streak and reminders |
| `HOST_API_KEY` | | bearer key for the host app's reminder feed; empty = off |
| `SESSION_TTL_HOURS` / `SESSION_ABSOLUTE_DAYS` | 168 / 30 | sliding learner session, hard cap |
| `IN_PER_MINUTE_IP`, `REPLY_RATE_PER_MINUTE`, `ADMIN_LOGIN_PER_MINUTE_IP` | 30, 20, 5 | rate limits |
| `LOCKOUT_AFTER_FAILURES` / `LOCKOUT_MINUTES` | 8 / 15 | admin account lockout |
| `MAX_AUDIO_MB` / `MAX_REQUEST_MB` | 10 / 12 | upload limits |
| `EMBED_ORIGINS` | | host-app origins allowed to show the app in an `<iframe>` (then cookies are `SameSite=None; Secure`) |
| `ALLOWED_ORIGINS` | | CORS, only if the API is called from another origin |

## API

**Learner** (needs the session cookie; JSON is camelCase and matches `src/types/tutor.ts`):

| | |
| --- | --- |
| `GET /in?uid=&name=[&centre=]&ts=&sig=` | checks the signed link (`ENTRY_LINK_SECRET`; unsigned only in development), creates or updates the learner, sets the cookie, then 303 → `/` |
| `GET /api/me` · `POST /api/signout` | |
| `GET /api/tutor/progress` | journey status, first-try/latest grammar per moment |
| `GET /api/tutor/moments/{id}` | the script (no evaluator data) |
| `GET/POST /api/tutor/moments/{id}/run` | current run (204 if never started) / resume or `{restart}` |
| `WS /ws/practice/{id}` | realtime reply: `start` → PCM frames → `stop` → `reply` (see `api/practice_ws.py`) |
| `POST /api/tutor/moments/{id}/replies` | upload fallback: multipart `turn_id`, `audio?`, `transcript?` → feedback (502 if the checker is down) |
| `POST /api/tutor/voice` | `{text}` → `audio/wav` in Gemini's voice (404 for text the app doesn't show; 204 if voice is off) |
| `GET /api/tutor/home` | programme day/week, streak, today's moment, story suggestion, certificate |
| `POST /api/tutor/onboarding` · `GET/PUT /api/tutor/preferences` | consent (required before practice → 428), hardest moment, quiet mode, reminder time |
| `POST …/run {restart, quick}` | `quick` = Rehearse now (first 3 lines); runs carry their own `turnIds` (hidden level) |
| `GET/POST /api/tutor/phrasebook` · `DELETE /{id}` · `GET /{id}/voice` | saved lines (only lines the app showed her); voice is GET for offline caching |
| `GET/POST /api/tutor/stories` · `DELETE /{id}` · `WS /ws/story` | "Tell me what happened" (typed or realtime), names removed before saving |
| `GET /api/tutor/certificate` · `DELETE /api/tutor/me/data` | certificate; delete my data |
| `GET /api/host/nudges` | host-app reminder feed (Bearer `HOST_API_KEY`) |
| `POST /api/tutor/moments/{id}/advance` | next line; completes the run after the last one |
| `GET /api/tutor/moments/{id}/summary` | sentences to practise |

**Admin** (`/api/admin/*`, admin cookie): `login`, `logout`, `session`, `me`, `me/password`,
`stats`, `learners[/{uid}[/reset|/signout|/export]]`, `replies`, `moments[/{id}]`,
`content/export`, `content/import`, `backup`, `audit`, `admins[/{username}]`, `nudge-settings`.

**Health:** `GET /api/health` (liveness), `GET /api/ready` (database check, 503 if it's down).

Every `POST/PUT/PATCH/DELETE` under `/api/` must send `X-Requested-With: ai-tutor` (CSRF guard).
The WebSocket checks `Origin` (this site, `ALLOWED_ORIGINS` or `EMBED_ORIGINS`) and the session
cookie, allows two sockets per learner, caps frames (16 KiB) and length, and shares the reply
rate limit. Behind a proxy, forward WebSocket upgrades for `/ws/`.

## Migrations

```bash
PYTHONPATH=src alembic revision --autogenerate -m "describe change"
PYTHONPATH=src alembic upgrade head        # or: python -m ai_tutor migrate
```

`tests/test_migrations.py` fails if the models and migrations drift apart.

## Tests & checks

```bash
pip install -r requirements-dev.txt
ruff check src tests && ruff format --check src tests && mypy src
pytest                                                   # SQLite
ai-tutor audio-check                                     # realtime audio against real Gemini (needs keys)
python -m evals.run_feedback_eval --live                 # feedback-quality eval on the real coach (needs keys)
TEST_DATABASE_URL=postgresql+asyncpg://u:p@localhost/tutor_test pytest   # PostgreSQL
```

## Deploying

`docker compose up -d --build` from the repo root starts PostgreSQL and the app. Then create an
admin with `docker compose exec app python -m ai_tutor create-admin <name>`. Put HTTPS in front
(Caddy, nginx, or a cloud load balancer). The app trusts `X-Forwarded-*` from the proxy.

- **One instance:** the rate limiter is in memory, so run one instance (like the Live tutor). For
  several instances, move rate limiting to Redis and run migrations as a deploy step.
- **Backups:** use the console (**Settings → Download backup**) or the database's own tools
  (`pg_dump`, or a copy of the SQLite file while the app is stopped).
