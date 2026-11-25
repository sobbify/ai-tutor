"""Practice journey: the programme, runs (full or "Rehearse now"), replies, progress and summaries."""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..db import utcnow
from ..models import Learner, Moment, Reply, Run, Turn
from ..schemas import (
    Feedback,
    GrammarFix,
    ImprovedItem,
    LearnerOut,
    MomentProgress,
    MomentRef,
    PractiseItem,
    ProgressOut,
    ReplyOut,
    RunOut,
    Slip,
    SnowflakesEarned,
    SummaryOut,
    Trends,
)
from . import programme as prog
from . import snowflakes as sf
from .content import published_moments
from .evaluator import EvaluationUnavailable, Evaluator, LineContext
from .improve import improved_words


@dataclass
class RunView:
    run: Run

    def attempts(self, turn_id: str) -> list[Reply]:
        return [r for r in self.run.replies if r.turn_id == turn_id]

    def latest(self, turn_id: str) -> Reply | None:
        a = self.attempts(turn_id)
        return a[-1] if a else None

    def first(self, turn_id: str) -> Reply | None:
        a = self.attempts(turn_id)
        return a[0] if a else None


def slips_of(raw: object) -> list[Slip]:
    """Stored extra slips (JSON), skipping anything malformed."""
    out: list[Slip] = []
    for item in raw if isinstance(raw, list) else []:
        try:
            out.append(Slip.model_validate(item))
        except ValueError:
            continue
    return out


def slip_pairs(r: Reply) -> list[tuple[str, str]]:
    """Every slip in a stored reply as (wrong, better)."""
    if not r.fix_better:
        return []
    return [(r.fix_wrong or "", r.fix_better), *((m.wrong, m.better) for m in slips_of(r.more_fixes))]


def improved_since(before: Reply | None, after: Reply) -> list[str]:
    """Words she fixed in `after` that were slips in `before` (an earlier try at the same line)."""
    if before is None or not (pairs := slip_pairs(before)):
        return []
    return improved_words(before.transcript, pairs, after.transcript)


def reply_out(r: Reply, previous: Reply | None = None) -> ReplyOut:
    fix = GrammarFix(wrong=r.fix_wrong or "", better=r.fix_better) if r.fix_better else None
    return ReplyOut(
        improved=improved_since(previous, r),
        id=r.id,
        turn_id=r.turn_id,
        transcript=r.transcript,
        attempt=r.attempt,
        feedback=Feedback(
            heard=True,
            positives=r.positives,
            fix=fix,
            tip=r.tip if fix else None,
            category=r.category if fix else None,
            more_fixes=slips_of(r.more_fixes) if fix else [],
            corrected=r.corrected if fix else None,
        ),
        typed=r.typed,
    )


class Journey:
    def __init__(
        self,
        db: AsyncSession,
        learner: Learner,
        *,
        tz: str = "Asia/Kolkata",
    ) -> None:
        self.db = db
        self.learner = learner
        self.tz = tz
        self._moments: list[Moment] | None = None

    # ---- loading ------------------------------------------------------------------------

    async def moments(self) -> list[Moment]:
        if self._moments is None:
            self._moments = await published_moments(self.db)
        return self._moments

    async def moment(self, moment_id: str) -> Moment:
        m = next((m for m in await self.moments() if m.id == moment_id), None)
        if m is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Moment not found")
        return m

    async def runs(self, moment_id: str) -> list[Run]:
        rows = await self.db.scalars(
            select(Run)
            .where(Run.learner_id == self.learner.id, Run.moment_id == moment_id)
            .options(selectinload(Run.replies))
            .order_by(Run.run_number)
        )
        return list(rows)

    async def all_runs(self) -> dict[str, list[Run]]:
        rows = await self.db.scalars(
            select(Run)
            .where(Run.learner_id == self.learner.id)
            .options(selectinload(Run.replies))
            .order_by(Run.run_number)
        )
        out: dict[str, list[Run]] = {}
        for r in rows:
            out.setdefault(r.moment_id, []).append(r)
        return out

    def today(self) -> date:
        return prog.local_today(self.tz)

    async def state(self, runs_by_moment: dict[str, list[Run]] | None = None) -> prog.ProgrammeState:
        runs_by_moment = runs_by_moment if runs_by_moment is not None else await self.all_runs()
        programme = [m for m in await self.moments() if m.kind == "programme"]
        done = all(self.completed(runs_by_moment.get(m.id, [])) for m in programme)
        return prog.programme_state(await prog.practice_days(self.db, self.learner), self.today(), done)

    # ---- rules -------------------------------------------------------------------------------

    @staticmethod
    def completed(runs: list[Run]) -> bool:
        return any(r.completed and r.kind == "full" for r in runs)

    async def unlocked(self, m: Moment, runs_by_moment: dict[str, list[Run]] | None = None) -> bool:
        """Anytime moments and the first chat are always open; programme weeks open as her practice days
        reach them — or as soon as she has finished every earlier week. Her hardest moment is open."""
        if m.kind != "programme" or m.id == self.learner.hardest_moment_id:
            return True
        runs_by_moment = runs_by_moment if runs_by_moment is not None else await self.all_runs()
        if (m.week or 1) <= (await self.state(runs_by_moment)).week:
            return True
        earlier = [x for x in await self.moments() if x.kind == "programme" and (x.week or 1) < (m.week or 1)]
        return all(self.completed(runs_by_moment.get(x.id, [])) for x in earlier)

    @staticmethod
    def grammar(m: Moment, run: Run) -> list[bool]:
        view = RunView(run)
        return [bool((f := view.first(t.id)) and f.fix_better is None) for t in prog.run_turns(m, run)]

    @staticmethod
    def to_run(m: Moment, run: Run) -> RunOut:
        view = RunView(run)
        turns = prog.run_turns(m, run)
        replies = [
            reply_out(r, a[-2] if len(a := view.attempts(t.id)) > 1 else None)
            for t in turns
            if (r := view.latest(t.id))
        ]
        turn_index = min(run.turn_index, len(turns) - 1)  # scripts can shrink in the console
        return RunOut(
            moment_id=m.id,
            run_number=run.run_number,
            turn_index=turn_index,
            turn_ids=[t.id for t in turns],
            kind=run.kind,
            replies=replies,
            completed=run.completed,
        )

    # ---- queries ---------------------------------------------------------------------------

    async def progress(self) -> ProgressOut:
        runs_by_moment = await self.all_runs()
        items: list[MomentProgress] = []
        for m in await self.moments():
            if m.kind == "baseline":
                continue  # the first chat is never shown as progress
            runs = runs_by_moment.get(m.id, [])
            full = [r for r in runs if r.kind == "full"]
            done = [r for r in full if r.completed]
            current = next((r for r in full if not r.completed), None)
            if done:
                state = "done"
            elif current:
                state = "in_progress"
            elif await self.unlocked(m, runs_by_moment):
                state = "available"
            else:
                state = "locked"
            total = len(prog.run_turns(m, current)) if current else len([t for t in m.turns if t.min_level == 1])
            items.append(
                MomentProgress(
                    id=m.id,
                    title=m.title,
                    order=m.position,
                    icon=m.icon,
                    kind=m.kind,
                    week=m.week,
                    status=state,
                    responses_total=total,
                    responses_done=min(current.turn_index, total) if current else 0,
                    times_practised=len(done),
                    first_try=self.grammar(m, done[0]) if done else None,
                    latest=self.grammar(m, done[-1]) if done else None,
                )
            )
        return ProgressOut(
            learner=LearnerOut(first_name=self.learner.first_name),
            moments=items,
            trends=await self.trends(runs_by_moment),
        )

    async def trends(self, runs_by_moment: dict[str, list[Run]]) -> Trends:
        """Gentle trends (FR-21): her first sessions against her latest, never a score."""
        baseline = {m.id for m in await self.moments() if m.kind == "baseline"}
        runs = sorted(
            (r for mid, rs in runs_by_moment.items() if mid not in baseline for r in rs if r.replies),
            key=lambda r: r.created_at,
        )

        def stats(rs: list[Run]) -> tuple[float, float] | None:
            replies = [x for r in rs for x in r.replies]
            if not replies:
                return None
            spoken = [x.fillers for x in replies if x.fillers is not None and not x.typed]
            fixes = sum(1 for x in replies if x.fix_better) / len(replies)
            return (sum(spoken) / len(spoken)) if spoken else 0.0, fixes

        def direction(first: float, latest: float) -> str:
            if latest < first * 0.9 - 0.01:
                return "fewer"
            if latest > first * 1.1 + 0.01:
                return "more"
            return "same"

        fixed: set[tuple[str, str]] = set()
        for mid, rs in runs_by_moment.items():
            if mid in baseline:
                continue
            previous: dict[str, RunView] = {}  # kind → the run before, for "since last time"
            for run in sorted(rs, key=lambda r: r.run_number):
                view = RunView(run)
                for turn_id in {r.turn_id for r in run.replies}:
                    opening, final = view.first(turn_id), view.latest(turn_id)
                    if opening and final and final.attempt > 1 and improved_since(opening, final):
                        fixed.add((mid, turn_id))
                    before = previous[run.kind].first(turn_id) if run.kind in previous else None
                    if opening and improved_since(before, opening):
                        fixed.add((mid, turn_id))
                previous[run.kind] = view

        days = await prog.practice_days(self.db, self.learner)
        out = Trends(days_practised=len(days), fillers=None, grammar_slips=None, lines_fixed=len(fixed))
        if len(runs) >= 2:
            first, latest = stats(runs[:2]), stats(runs[-2:])
            if first and latest:
                out.fillers = direction(first[0], latest[0])  # type: ignore[assignment]
                out.grammar_slips = direction(first[1], latest[1])  # type: ignore[assignment]
        return out

    async def current_run(self, moment_id: str) -> RunOut | None:
        m = await self.moment(moment_id)
        runs = await self.runs(m.id)
        run = next((r for r in runs if not r.completed), None) or (runs[-1] if runs else None)
        return self.to_run(m, run) if run else None

    async def summary(self, moment_id: str) -> SummaryOut:
        m = await self.moment(moment_id)
        runs = await self.runs(m.id)
        done = [r for r in runs if r.completed]
        if not done:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Finish this moment to see a summary")
        latest = done[-1]
        full_done = [r for r in done if r.kind == "full"]
        programme = [x for x in await self.moments() if x.kind == "programme"]
        later = [x for x in programme if x.position > m.position]
        nxt = later[0] if later and m.kind == "programme" else None
        first_completion = latest.kind == "full" and len(full_done) == 1
        unlocked = None
        if first_completion:
            # Moments this completion opened (they were locked without it).
            runs_by_moment = await self.all_runs()
            without = {k: v for k, v in runs_by_moment.items() if k != m.id}
            for x in programme:
                if x.id != m.id and await self.unlocked(x, runs_by_moment) and not await self.unlocked(x, without):
                    unlocked = MomentRef(id=x.id, title=x.title)
                    break

        def fixes(run: Run) -> list[PractiseItem]:
            view, items = RunView(run), []
            for t in prog.run_turns(m, run):
                f = view.first(t.id)
                if f and f.fix_better:
                    items.append(
                        PractiseItem(
                            turn_id=t.id,
                            transcript=f.transcript,
                            fix=GrammarFix(wrong=f.fix_wrong or "", better=f.fix_better),
                            tip=f.tip,
                            category=f.category,
                            more_fixes=slips_of(f.more_fixes),
                            corrected=f.corrected,
                        )
                    )
            return items

        previous = [r for r in done[:-1] if r.kind == latest.kind]

        def improvements() -> list[ImprovedItem]:
            """Lines she got right after slipping: on another try in this run, or since last run."""
            items: list[ImprovedItem] = []
            now, then = RunView(latest), RunView(previous[-1]) if previous else None
            for t in prog.run_turns(m, latest):
                first, last = now.first(t.id), now.latest(t.id)
                if not first or not last:
                    continue
                before, when = (first, "again") if last.attempt > 1 and slip_pairs(first) else (None, "")
                if before is None and then is not None:
                    before, when, last = then.first(t.id), "last_time", first
                if before is None or not (words := improved_since(before, last)):
                    continue
                items.append(
                    ImprovedItem(
                        turn_id=t.id,
                        when=when,
                        before=before.transcript,
                        before_wrongs=[w for w, _ in slip_pairs(before) if w],
                        after=last.transcript,
                        words=words,
                    )
                )
            return items

        return SummaryOut(
            moment_id=m.id,
            title=m.title,
            first_completion=first_completion,
            unlocked=unlocked,
            next_moment_id=nxt.id if nxt else None,
            practise=fixes(latest),
            previous_practise_count=len(fixes(previous[-1])) if previous else None,
            snowflakes=await self._snowflakes(latest),
            improved=improvements(),
        )

    async def _snowflakes(self, run: Run) -> SnowflakesEarned:
        items = sf.run_items(run)
        week = await sf.totals(self.db, [self.learner.id], since_day=sf.week_start(self.today()), tz=self.tz)
        return SnowflakesEarned(earned=sum(i.amount for i in items), items=items, week=week.get(self.learner.id, 0))

    # ---- commands -------------------------------------------------------------------------

    def _require_consent(self) -> None:
        if self.learner.consented_at is None:
            raise HTTPException(status.HTTP_428_PRECONDITION_REQUIRED, "Please read and accept how ELSA works first")

    async def start(self, moment_id: str, restart: bool, quick: bool = False) -> RunOut:
        self._require_consent()
        m = await self.moment(moment_id)
        runs_by_moment = await self.all_runs()
        if not await self.unlocked(m, runs_by_moment):
            raise HTTPException(status.HTTP_423_LOCKED, "This moment is still locked")
        if quick and m.kind == "baseline":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "The first chat can't be rehearsed")
        runs = runs_by_moment.get(m.id, [])
        kind = "quick" if quick else "full"
        existing = next((r for r in runs if not r.completed), None)
        if existing and existing.kind == kind and not restart:
            return self.to_run(m, existing)
        if existing:  # a restart, or switching between full and quick, abandons the unfinished run
            await self.db.delete(existing)
            await self.db.flush()
        state = await self.state(runs_by_moment)
        level = await prog.run_level(self.db, self.learner, m, harder_today=state.harder_today and not quick)
        run = Run(
            learner_id=self.learner.id,
            moment_id=m.id,
            run_number=max((r.run_number for r in runs), default=0) + 1,
            kind=kind,
            level=level,
            replies=[],
        )
        self.db.add(run)
        await self.db.flush()
        return self.to_run(m, run)

    async def _open(self, m: Moment) -> Run:
        run = next((r for r in await self.runs(m.id) if not r.completed), None)
        if run is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "No active practice run")
        return run

    @staticmethod
    def _current_turn(m: Moment, run: Run) -> Turn:
        turns = prog.run_turns(m, run)
        return turns[min(run.turn_index, len(turns) - 1)]

    async def line_context(self, moment_id: str, turn_id: str) -> LineContext:
        """The evaluator's view of the current line; 404/409 unless ``turn_id`` is the line now."""
        self._require_consent()
        m = await self.moment(moment_id)
        turn = self._current_turn(m, await self._open(m))
        if turn.id != turn_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "That line is no longer current")
        return self._context(m, turn)

    @staticmethod
    def _context(m: Moment, turn: Turn) -> LineContext:
        model_reply = turn.hint_text if turn.hint_kind == "sentence" else " / ".join(turn.hint_options or [])
        return LineContext(
            scene=m.scene,
            character_name=m.character_name,
            possessive=m.possessive,
            parent_line=turn.parent_line,
            model_reply=model_reply or "",
            demo_reply=turn.demo_reply,
            known_fixes=turn.known_fixes,
        )

    async def reply(
        self,
        moment_id: str,
        evaluator: Evaluator,
        *,
        turn_id: str,
        audio: bytes | None,
        mime: str | None,
        transcript: str | None,
        typed: bool = False,
    ) -> ReplyOut:
        self._require_consent()
        m = await self.moment(moment_id)
        run = await self._open(m)
        turn = self._current_turn(m, run)
        if turn.id != turn_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "That line is no longer current")
        ctx = self._context(m, turn)
        started = time.perf_counter()
        try:
            result = await evaluator.evaluate(
                ctx, audio=None if typed else audio, mime_type=mime, transcript_hint=transcript
            )
        except EvaluationUnavailable:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Couldn’t check that reply. Please try again.") from None
        attempt = len(RunView(run).attempts(turn.id)) + 1
        previous = RunView(run).latest(turn.id)
        tip = result.tip if result.fix else None
        category = (result.category or "grammar") if result.fix else None
        out = ReplyOut(
            id=None,
            turn_id=turn.id,
            transcript=result.transcript,
            attempt=attempt,
            feedback=Feedback(
                heard=result.heard,
                positives=result.positives,
                fix=result.fix,
                tip=tip,
                category=category,
                more_fixes=result.more_fixes if result.fix else [],
                corrected=result.corrected if result.fix else None,
            ),
            typed=typed,
        )
        if not result.heard:
            return out
        row = Reply(
            run_id=run.id,
            turn_id=turn.id,
            parent_line=turn.parent_line,
            attempt=attempt,
            transcript=result.transcript[:2000],
            positives=result.positives,
            fix_wrong=result.fix.wrong if result.fix else None,
            fix_better=result.fix.better if result.fix else None,
            tip=tip,
            category=category,
            more_fixes=[m.model_dump() for m in result.more_fixes] if result.fix else [],
            corrected=result.corrected if result.fix else None,
            fillers=None if typed else result.fillers,
            signals=result.signals(),
            typed=typed,
            evaluator=evaluator.name,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        run.replies.append(row)
        run.updated_at = utcnow()
        await self.db.flush()
        out.id = row.id
        out.improved = improved_since(previous, row)
        if m.kind != "baseline":
            await prog.mark_practised(self.db, self.learner, self.today())
        # Her audio was only sent to Gemini to be checked; it is never stored — just the transcript.
        return out

    async def advance(self, moment_id: str) -> RunOut:
        m = await self.moment(moment_id)
        run = await self._open(m)
        turns = prog.run_turns(m, run)
        idx = min(run.turn_index, len(turns) - 1)
        if RunView(run).latest(turns[idx].id) is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Reply to this line first")
        if idx >= len(turns) - 1:
            run.turn_index, run.completed, run.completed_at = idx, True, utcnow()
            await self.db.flush()
            await prog.after_run(self.db, self.learner, m, run)
            await prog.refresh_profile(self.db, self.learner, force=m.kind == "baseline")
            await self._check_certificate()
        else:
            run.turn_index = idx + 1
        await self.db.flush()
        return self.to_run(m, run)

    async def _check_certificate(self) -> None:
        if self.learner.certificate_earned_at is None and (await self.state()).complete:
            self.learner.certificate_earned_at = utcnow()
