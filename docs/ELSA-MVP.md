# ELSA 1.0 (MVP) — what's built against the PRD (v1.0)

ELSA = English Learning Stimulated AI (working name). This maps every requirement in the PRD's
checklist (page 15) to the app. **P0** = pilot, **P1** = MVP, **P2** = later.

Decisions taken with the product owner for this stage:

- **English only for now.** No support-language picker or side-by-side translation yet (FR-3,
  FR-9). "Say it my way" is covered by the coach keeping her own words and changing the minimum.
- **No groups-of-5 totals dashboard** (FR-37). The admin console is the Lighthouse ops tool;
  centre heads have no access at all.
- **Groups started early (phase 2, 2026-11-24), named, not anonymous.** Up to 5 teachers from one
  centre see each other's names and **snowflakes** — ELSA's XP, earned per session like Duolingo's,
  for effort only (finishing, "Say it again", stories, practising on a school day), never for
  accuracy. Groups share a weekly snowflake goal. Feedback, transcripts and levels stay private
  (FR-28). Anonymous cross-centre games (FR-29) and AI-led group role-plays (FR-27) are not built.
  Note: the member list is ordered by snowflakes this week, which is close to the leaderboard the
  PRD rules out for *levels* (§09); snowflakes measure practice, not ability.
- **Several slips at once (2026-11-24, product owner).** Instead of the PRD's one fix per turn
  (FR-11), ELSA names every slip in a reply — up to 4, most important first. Each has its own
  category and a correction that changes only that slip, so the card shows one change at a time,
  grouped by kind (Tense, A / an / the, …), with "All together" (the whole reply corrected) at the
  end. Still no marks or scores. Progress still counts a reply as right only when it had no slip.
- Scripts are **drafts for academic-team review** — editable in the admin console (`/admin/content`).

## Requirement checklist

| FR | Requirement | P | Status | Where |
| --- | --- | --- | --- | --- |
| 1 | Opens in Buddy's World with existing sign-in | P0 | ✅ | Host app opens a signed `/in?uid=&name=[&centre=]&ts=&sig=` (HMAC, 5 min) → HttpOnly cookie; spec in `docs/HOST-INTEGRATION.md` |
| 2 | Plain consent; keeping recordings optional | P0 | ✅ | `/welcome` step 1. Stricter than the PRD: audio is never recorded — it goes live to Gemini and only the transcript is kept |
| 3 | Pick support language; English interface | P0 | ⏸ English only (decision) | — |
| 4 | Friendly baseline chat, never shown as a score | P0 | ✅ | "Say Hello to ELSA" (3 lines, no feedback shown) → hidden profile |
| 5 | Her hardest moment shown first | P1 | ✅ | `/welcome` step 2; recommended first, unlocked even if a later week |
| 6 | Scenario-first home | P0 | ✅ | Home: today's moment, 3-week map, Rehearse Anytime |
| 7 | Voice role-play with an AI parent | P0 | ✅ | Gemini Live voices; parent tone follows the line's difficulty |
| 8 | Hear → learn → speak again | P0 | ✅ | Learn step (hear + save phrases, tip) → role-play → "Say It Again" |
| 9 | Meaning side by side | P0 | ⏸ English only (decision) | — |
| 10 | "Say it my way" | P0 | ◑ | Fixes keep her words; translation from her language comes with FR-3 |
| 11 | One fix per turn, no marks | P0 | ⚠ changed (decision 2026-11-24) | Every slip in a reply (up to 4), each with its own one-change fix, grouped by kind, then the whole reply corrected. Still no marks or scores |
| 12 | Grammar and sentence micro-lessons | P0 | ✅ | One-line tip with every fix; lesson tip per moment |
| 13 | Filler words tracked privately | P0 | ✅ | Counted per reply (Gemini), shown only as a gentle trend |
| 14 | Never judges accent | P0 | ✅ | Prompts: grammar only, intelligibility never accent; "Could you say it again?" |
| 15 | Four difficulty levels | P1 | ✅ | Lines tagged 1–4; hidden level per moment rises only when she's ready |
| 16 | Typing fallback | P1 | ✅ | "Type instead" in every role-play and story; Quiet mode starts with typing |
| 17 | "Rehearse now" in 5 minutes | P1 | ✅ | `/rehearse` — first 3 lines, not counted as progress |
| 18 | "Tell me what happened", names removed | P1 | ✅ | `/story` (voice or typed); names replaced before saving; day 5 suggestion |
| 19 | Keep her words, change the minimum | P0 | ✅ | Evaluator and Live prompts |
| 20 | Learns her favourite phrases | P2 | — | |
| 21 | Private trends, no grades | P0 | ✅ | Progress: "Gently, Over Time" (days, fillers, slips) |
| 22 | Offline phrasebook | P1 | ✅ | `/phrasebook`; service worker keeps lines and their audio |
| 23 | Certificate she chooses to share | P1 | ✅ | `/certificate` after 15 practice days + every programme moment; PNG / share |
| 24 | Private school-day streak | P1 | ✅ | Mon–Fri, holidays skipped, one free miss a week |
| 25 | Groups of 4–5, same centre, similar level | P2 | ◑ | `/group`: up to 5, same centre (from `/in?centre=`); formed by invite code, not matched by level |
| 26 | Optional, leave any time | P2 | ✅ | `/group` → Leave Group; an empty group is deleted |
| 27 | 15-min AI-led group role-play | P2 | — | Not built: each teacher practises alone; snowflakes count towards the group's weekly goal |
| 28 | Feedback stays private | P2 | ✅ | Members see name, weekly snowflakes, "practised today" — nothing else |
| 29 | Anonymous cross-centre games | P2 | ⏸ not now (decision: named, not anonymous) | |
| 30 | Invites only within her centre | P2 | ✅ | Code from another centre → "That group is for another centre." Invite card on Home at programme end or day 30 |
| 31 | One nudge a day at her time | P1 | ✅ | Settings → reminder time; host feed `GET /api/host/nudges` |
| 32 | None on weekends, holidays, after 8 pm | P1 | ✅ | Feed rules; holidays set in the admin console |
| 33 | Never shames missed days | P1 | ✅ | Fixed kind messages, never mention misses |
| 34 | Central encouragement, max weekly | P1 | ✅ | Admin → Settings → Reminders |
| 35 | PTM reminder from school calendar | P2 | — | |
| 36 | No individual data to centre heads | P0 | ✅ | No centre-head access anywhere |
| 37 | Totals dashboard, groups of 5+ | P1 | ⏸ skipped (decision) | |
| 38 | Anonymised patterns for academic team | P1 | ◑ | Admin dashboard: top grammar fixes, moment funnel |
| 39 | Progress moves with her; delete on request | P1 | ✅ | Progress keyed by her uid; Settings → Delete my data |
| 40 | Writing helper | P2 | — | |

## The programme (PRD §05)

- **15 practice days**, counted by days she actually practised (missed days never delay her).
- **Week 1** drop-off + pick-up (confirm-back for medicine, allergies, pickup list; two-line
  summary; small incidents) · **Week 2** parent meetings · **Week 3** worried or upset parents.
- A week opens when her practice days reach it, or as soon as she finishes every earlier week.
- **Day 5 of each week:** the role-play runs one level harder, and "Tell me what happened" is suggested.
- **Rehearse anytime:** a parent calls, a small incident, admissions tour, celebration day.

## Hidden assessment (PRD §09)

Learned from normal practice (and the first chat), refreshed weekly, **never displayed** — not to
her, not in the admin console. Five signals per reply from Gemini: fluency (fillers), grammar,
vocabulary (polite, not blunt), listening (answered the question), intelligibility (never accent).
The band only picks her starting difficulty; levels then rise per moment when a run is ≥ 75 % right
first time with few fillers. Levels never go down.

## Privacy (PRD §08)

| | Teacher | Admin console (Lighthouse ops) | Centre head |
| --- | --- | --- | --- |
| Sessions, transcripts, fixes | ✅ | ✅ (pilot operations) | ✗ |
| Audio | never stored | never stored | never stored |
| Stories ("Tell me what happened") | ✅ | ✗ | ✗ |
| Hidden level / profile | ✗ | ✗ | ✗ |
| Phrasebook, streak, certificate | ✅ | ✗ | ✗ |

Her voice is processed live by Gemini (realtime) and is **never recorded or stored** — not on the
server, not in the database, not in logs. Only the transcript of what she said, the feedback and
the private signals are saved, and she can delete them (Settings → Delete my data). Logs never
contain transcripts, audio or names.
Legal review of DPDP Act 2023 is still open (PRD open question).

## Coaching quality

One prompt (`services/evaluator.py`) drives both the realtime coach and the fallback checker:

- **Her words, kept.** The fix is the *whole sentence* that had the slip, changed as little as
  possible — never a rewrite and never a fragment — plus one short rule with a tiny example.
- **Indian English respected.** "ma'am", "sir", "kindly", "today itself", short spoken answers and
  numbers said as digits are correct and are never "fixed". If she slips into Hindi she gets the
  sentence in simple English, never a telling-off.
- **Nothing invented.** The transcript holds only words she said. The server also compares Gemini's
  result with its own speech-to-text of the same audio: if that heard only "um"/"hmm", the reply
  counts as not heard; if the two barely overlap, the audio is checked again by the fallback.
- **Never about accent**, and instructions spoken inside a reply are ignored.

`backend/evals/feedback_cases.json` holds the 36 cases used to tune this; on the realtime coach the
final prompt fixed every failure seen before (fragments, an invented transcript for "hmm").

**Gemini quota:** free-tier keys allow about 20 requests a day *per model* for the fallback checker,
so `GEMINI_EVAL_MODEL` is a chain (`gemini-flash-latest,gemini-flash-lite-latest`). For the pilot,
use a billed key: realtime sessions and the fallback both need headroom for every teacher.

## Open questions carried over from the PRD

Product name (ELSA vs ELSA Speak), whether centre heads may see participation, the academic
rubric and thresholds, approved medicine/allergy/incident scripts, nudge timing, and whether the
certificate counts for appraisal.
