# ELSA — AI English speaking tutor (MVP)

[![CI](https://github.com/sobbify/ai-tutor/actions/workflows/ci.yml/badge.svg)](https://github.com/sobbify/ai-tutor/actions/workflows/ci.yml)

A private English speaking coach for EuroKids teachers, inside Buddy's World. Teachers rehearse
real moments with parents — drop-off, pick-up, parent meetings, worried parents — in a 15-day
programme: a short Learn step, a voice role-play with an AI parent (Gemini Live, realtime), one
grammar fix and tip at a time, never a grade, never an accent judgement. Only she sees her practice.
Her voice goes to Gemini live and is **never recorded or stored** — only transcripts are saved.
A database console at `/admin` manages content and operations.

**What's built against the PRD (FR-1 … FR-40):** see [`docs/ELSA-MVP.md`](docs/ELSA-MVP.md).

Teacher screens: Welcome (consent, hardest moment, first chat) · Home (day N
of 15, today's moment, streak, 3-week map, Rehearse Anytime) · Learn · Role-play (speak or type) ·
Chat · Summary · Progress (gentle trends) · Rehearse now (5 min) · Tell me what happened ·
Phrasebook (offline) · Certificate · Settings and privacy (reminder time, quiet mode, delete my data).

```
ai-tutor-app/
├── src/              React app (learner screens 02–17 from the Figma file + the /admin console)
├── backend/          FastAPI service, PostgreSQL/SQLite, Alembic migrations, Gemini Live audio + evaluation
├── content/          moments.json: the practice scripts (draft, academic-team review; seeded on first start,
│                     pushed into existing databases when its "version" goes up)
├── docs/ELSA-MVP.md  PRD requirement-by-requirement status
├── run.py            one-command launcher (dev or production-style)
├── purge.py          removes everything run.py installed/generated (keys + database kept unless asked)
├── Dockerfile        production image (builds the frontend, runs as non-root)
└── docker-compose.yml  PostgreSQL + app
```

## Quick start (your laptop)

Needs Python 3.10+ and Node 20.19+ (run.py checks both).

```bash
python run.py
```

The first run:

1. writes `backend/.env`. Paste your Gemini key(s), or press Enter to use the offline checker.
2. installs the Python and npm packages.
3. migrates the database (SQLite in `backend/data/`).
4. asks you to create the first **console admin**.

It then opens the app as a demo learner. `python run.py --prod` builds once and serves everything
from <http://localhost:8000>. Run `python run.py --help` for the other options.

To clean up, run `python purge.py`. It removes what was installed or generated here
(`node_modules`, build output, caches). It always shows the list and asks first, and
`--dry-run` only shows the list. Your keys (`backend/.env`) and the database
(`backend/data/`) stay unless you add `--env` or `--db`; `--db` also asks you to type `delete`.
`--pip` also uninstalls the Python packages, and `--all` does all three.

## How learners get in

The host app opens:

```
https://<server>/in?uid=<learner id>&name=<display name>
```

The backend checks both values, creates or updates that learner, and sets an HttpOnly session
cookie. It then redirects to the bare app URL, so nothing stays in the address bar. There is no
sign-in screen and no reports API back out. Without a valid cookie, pages show "Session not
available — open ELSA again from the app". First-time teachers land on the Welcome screens.

Reminders are sent by the host app: it polls `GET /api/host/nudges` with `Authorization: Bearer
<HOST_API_KEY>` and gets `{"nudges":[{"uid","message"}]}` — each teacher at most once a day, at or
after the time she chose, school days only, never after 8 pm.

> There is no password yet: anyone who opens `/in` with a learner's uid becomes that learner.
> That fits an app that controls the link. To close the gap later, sign the link (HMAC) or add a PIN.

## Database console (`/admin`)

You sign in with an admin username and password (create one with `python run.py --create-admin`
or `python -m ai_tutor create-admin <name>`).

- **Dashboard:** learners, who's signed in now, replies, first-try grammar accuracy, replies per
  day, how far learners get in each moment, and the most common fixes.
- **Learners:** search and sort, then open a learner's page for progress, signed-in browsers and
  recent replies. From there you can rename, export their data (JSON), reset progress (all moments
  or one), sign them out everywhere, or delete them (you type their uid to confirm).
- **Replies:** every reply, with its feedback. Filter by moment or outcome, or search the text.
- **Content:** edit moments and lines (type: programme week / anytime / first chat, the Learn step's
  key phrases and tip, each line's difficulty level 1–4, parent line, hint sentence or starters,
  **avatar video URL** per line, poster image), reorder, publish or hide, create or delete, and
  import/export JSON. Changes go live immediately.
- **Audit log:** every admin sign-in (including failed ones) and every change.
- **Settings:** reminders (head-office encouragement, school holidays), download a full JSON
  backup, manage admins, change your password.

The console never shows a teacher's hidden level or her stories, and centre heads
have no access at all.

## Frontend

React 19 + TypeScript (strict) + Vite + Tailwind v4 + TanStack Query + Zustand + React Router 7
(lazy routes; learners never download the admin console). API responses are validated with zod.

```bash
npm run dev          # Vite on :5173, proxies /in, /api and /ws to the backend on :8000
npm run dev:mock     # browser-only demo with fake data (no backend), /?demo=progress for screen 14
npm run lint && npm test && npm run build
npm run test:e2e     # Playwright + axe accessibility checks (mock build)
```

- The parent appears as an **illustrated, animated portrait** (`features/conversation/Portrait.tsx`):
  an original flat-style character in a scene that fits the moment (school gate, classroom, office,
  phone call, Diwali celebration; ELSA wears a headset). Each character keeps a stable look, blinks
  and breathes while idle, talks while the line plays, and their face follows the line's mood
  (calm / worried / upset, from the line's level). When a line gets a `videoUrl` (set in Content)
  the real avatar video takes its place with the line text as captions.
- **Appearance:** Light, Dark or Auto (follows the phone) in Settings, saved on the device. Every
  colour is a token in `styles/index.css`, so both themes pass WCAG AA (checked by axe in e2e).
  The admin console always stays light.
- **Feel:** route changes cross-fade (View Transitions), feedback slides in with a light buzz on
  phones, a mistake-free reply gets a small sparkle, finishing a moment or earning the certificate
  throws confetti, and loading shows shimmering placeholders. All motion turns off under
  "reduce motion".
- Realtime audio, as in the Live tutor: an AudioWorklet (`public/pcm-recorder-worklet.js`)
  downsamples the mic to PCM16 16 kHz and `useLiveReply` streams it over a WebSocket while the
  teacher speaks. Gemini Live hears the reply as it's said, so the transcript shows ~0.5 s and the
  feedback ~1 s after Stop. If sockets are blocked (or in the demo build) the app records with
  `MediaRecorder` and uploads instead. The mic is released on stop, Start Over and leaving the page.
- Voice: the parent's lines, model replies and grammar fixes play in Gemini's native voices
  (`lib/speech.ts` → `POST /api/tutor/voice`, prefetched so they start instantly). The browser's
  speech synthesis is the fallback.

## Backend

See [`backend/README.md`](backend/README.md) for the API, configuration, migrations and operations.

## Security

- HttpOnly session cookies. Only SHA-256 token hashes are stored. Learner sessions expire after
  7 days of inactivity (30 days at most); admin sessions are separate and short.
- CSRF protection: state-changing requests need `X-Requested-With` and a same-site `Origin`, and
  cookies are SameSite. The admin cookie is `SameSite=Strict` and scoped to `/api/admin`.
- Admin passwords are hashed with scrypt and must meet a strength rule. Failed sign-ins lock the
  account and are rate-limited per IP, with the same error message either way (no username
  enumeration). Every change is audited.
- Rate limits on `/in`, replies, voice and admin sign-in, plus size limits on requests and audio.
  Audio uploads must be an allowed type. The realtime socket checks Origin and the session cookie,
  caps frame size, length and sockets per learner. Only lines the app shows can be voiced.
- Every response carries security headers: X-Frame-Options or `frame-ancestors`, `nosniff`,
  `no-referrer`, Permissions-Policy (microphone on this site only), and HSTS when served over
  HTTPS. The production build also sets a strict Content-Security-Policy.
- Logs are structured JSON with request IDs. Transcripts, audio, query strings and secrets are
  never logged. API docs are off in production.
- Results are never invented: if Gemini fails, the reply gets a 502 "try again" and nothing is
  stored.

## Quality

- **Backend:** 76 pytest tests pass on SQLite **and** PostgreSQL 16 (realtime audio against a
  fake Gemini Live; `ai-tutor audio-check` runs reply and story feedback against the real one —
  results arrive 1.3–2.2 s after Stop). ruff and mypy `--strict` are clean, and migrations match
  the models and run up and down.
- **Feedback quality:** `backend/evals/` holds 36 scripted teacher replies (tense, agreement,
  articles, prepositions, word order, Indian English that must *not* be "fixed", fillers, Hindi,
  a blunt reply, an off-topic reply, a prompt injection, silence). `python -m evals.run_feedback_eval
  --live` voices each one and runs it through the real Gemini Live coach.
- **Frontend:** 63 Vitest tests, a Playwright end-to-end flow, and axe WCAG 2.1 AA checks with
  0 violations on every learner and console screen — in light **and** dark.
- **Google Lighthouse** (production build): Accessibility 100, Best Practices 100, SEO 100 and
  Performance 92–97 on the learner screens (home, welcome, learn, story, phrasebook, settings,
  progress). The console scores Accessibility 100 too.
