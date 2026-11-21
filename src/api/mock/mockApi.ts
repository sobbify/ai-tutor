import { z } from 'zod';
import {
  FeedbackSchema,
  ReplySchema,
  StorySchema,
  type Certificate,
  type Home,
  type Moment,
  type MomentId,
  type MomentProgress,
  type Phrase,
  type Preferences,
  type Progress,
  type Reply,
  type Run,
  type Story,
  type Summary,
} from '@/types/tutor';
import { ApiError, type SubmitReplyInput, type TutorApi } from '../types';
import { LEARNER, MOMENTS, type MockMoment, type MockTurn } from './content';
import { evaluateReply } from './evaluator';
import { MAX_LEVEL, QUICK_LINES, WEEK_TITLES, isoDay, programmeState, streak, PROGRAMME_DAYS } from './programme';

/**
 * The whole tutor in the browser (demo build, component tests). Mirrors the FastAPI rules closely
 * enough to exercise every screen; the backend stays the source of truth.
 */

const STORAGE_KEY = 'ai-tutor:mock:v2';

const StoredRunSchema = z.object({
  runNumber: z.number().int().min(1),
  turnIndex: z.number().int().min(0),
  completed: z.boolean(),
  kind: z.enum(['full', 'quick']),
  level: z.number().int().min(1).max(4),
  replies: z.array(ReplySchema),
  /** Feedback on the first attempt at each turn — this is what progress dots measure. */
  firstAttempts: z.record(z.string(), z.object({ transcript: z.string(), feedback: FeedbackSchema })),
});
type StoredRun = z.infer<typeof StoredRunSchema>;

const MockStateSchema = z.object({
  runs: z.record(z.string(), z.array(StoredRunSchema)),
  consented: z.boolean(),
  quietMode: z.boolean(),
  nudgeTime: z.string().nullable(),
  hardestMomentId: z.string().nullable(),
  practiceDays: z.array(z.string()),
  levels: z.record(z.string(), z.number()),
  phrasebook: z.array(z.object({ id: z.number(), text: z.string(), source: z.string(), momentId: z.string().nullable(), createdAt: z.string() })),
  stories: z.array(StorySchema),
  certificateEarnedAt: z.string().nullable(),
  nextId: z.number(),
});
type MockState = z.infer<typeof MockStateSchema>;

const emptyState = (): MockState => ({
  runs: {},
  consented: false,
  quietMode: false,
  nudgeTime: null,
  hardestMomentId: null,
  practiceDays: [],
  levels: {},
  phrasebook: [],
  stories: [],
  certificateEarnedAt: null,
  nextId: 1,
});

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** localStorage can throw (private mode, quota, disabled) — fall back to memory. */
function safeStorage(): KeyValueStore {
  const memory = new Map<string, string>();
  const fallback: KeyValueStore = {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
    removeItem: (k) => void memory.delete(k),
  };
  try {
    const probe = '__ai_tutor_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return fallback;
  }
}

export interface MockApiOptions {
  storage?: KeyValueStore;
  /** Simulated network latency in ms (0 in tests). */
  latencyMs?: number;
  /** Start as a teacher who has already accepted and done the first chat (tests, demos). */
  onboarded?: boolean;
  /** "Today", for tests. */
  today?: () => Date;
}

export function createMockApi({ storage = safeStorage(), latencyMs = 350, onboarded = false, today = () => new Date() }: MockApiOptions = {}): TutorApi & {
  reset(): void;
  seedDemoProgress(): void;
} {
  const load = (): MockState => {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return onboardedState();
      const parsed = MockStateSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : onboardedState();
    } catch {
      return onboardedState();
    }
  };
  const save = (state: MockState) => {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage full or unavailable: progress just won't survive a reload */
    }
  };
  const wait = <T,>(value: T): Promise<T> =>
    latencyMs > 0 ? new Promise((resolve) => setTimeout(() => resolve(value), latencyMs)) : Promise.resolve(value);
  const todayIso = () => isoDay(today());

  const baseline = MOMENTS.find((m) => m.kind === 'baseline');
  const programme = MOMENTS.filter((m) => m.kind === 'programme');

  function onboardedState(): MockState {
    const state = emptyState();
    if (!onboarded) return state;
    state.consented = true;
    if (baseline) {
      state.runs[baseline.id] = [{ runNumber: 1, turnIndex: 0, completed: true, kind: 'full', level: 1, replies: [], firstAttempts: {} }];
    }
    return state;
  }

  const findMoment = (id: MomentId): MockMoment => {
    const moment = MOMENTS.find((m) => m.id === id);
    if (!moment) throw new ApiError('Moment not found', 404, 'not_found');
    return moment;
  };
  const toPublicMoment = (m: MockMoment): Moment => ({
    id: m.id,
    title: m.title,
    order: m.order,
    icon: m.icon,
    kind: m.kind,
    week: m.week,
    scene: m.scene,
    character: m.character,
    lesson: m.lesson,
    turns: m.turns.map(({ id, parentLine, hint, videoUrl, minLevel }) => ({
      id,
      parentLine,
      hint,
      videoUrl,
      mood: (minLevel ?? 1) >= 4 ? ('upset' as const) : minLevel === 3 ? ('worried' as const) : ('calm' as const),
    })),
  });

  const runsOf = (state: MockState, id: MomentId) => state.runs[id] ?? [];
  const openRun = (state: MockState, id: MomentId) => runsOf(state, id).find((r) => !r.completed) ?? null;
  const isDone = (state: MockState, id: MomentId) => runsOf(state, id).some((r) => r.completed && r.kind === 'full');
  const stateOf = (state: MockState) =>
    programmeState(state.practiceDays, todayIso(), programme.every((m) => isDone(state, m.id)));

  const runTurns = (m: MockMoment, run: Pick<StoredRun, 'level' | 'kind'>): MockTurn[] => {
    const turns = m.turns.filter((t) => t.minLevel <= run.level);
    const list = turns.length ? turns : m.turns.slice(0, 1);
    return run.kind === 'quick' ? list.slice(0, QUICK_LINES) : list;
  };

  const isUnlocked = (state: MockState, m: MockMoment, without?: MomentId) => {
    if (m.kind !== 'programme' || m.id === state.hardestMomentId) return true;
    const view = without ? { ...state, runs: { ...state.runs, [without]: [] } } : state;
    if ((m.week ?? 1) <= stateOf(view).week) return true;
    return programme.filter((x) => (x.week ?? 1) < (m.week ?? 1)).every((x) => isDone(view, x.id));
  };
  const requireConsent = (state: MockState) => {
    if (!state.consented) throw new ApiError('Please read and accept how ELSA works first', 428, 'consent_required');
  };

  const toRun = (m: MockMoment, run: StoredRun): Run => {
    const turns = runTurns(m, run);
    return {
      momentId: m.id,
      runNumber: run.runNumber,
      turnIndex: Math.min(run.turnIndex, turns.length - 1),
      turnIds: turns.map((t) => t.id),
      kind: run.kind,
      replies: run.replies,
      completed: run.completed,
    };
  };

  const grammarResults = (m: MockMoment, run: StoredRun) => runTurns(m, run).map((t) => run.firstAttempts[t.id]?.feedback.fix === null);

  const progressOf = (state: MockState, m: MockMoment): MomentProgress => {
    const full = runsOf(state, m.id).filter((r) => r.kind === 'full');
    const done = full.filter((r) => r.completed);
    const open = full.find((r) => !r.completed);
    let status: MomentProgress['status'] = 'locked';
    if (done.length > 0) status = 'done';
    else if (open) status = 'in_progress';
    else if (isUnlocked(state, m)) status = 'available';
    const total = open ? runTurns(m, open).length : m.turns.filter((t) => t.minLevel === 1).length;
    const first = done[0];
    const last = done[done.length - 1];
    return {
      id: m.id,
      title: m.title,
      order: m.order,
      icon: m.icon,
      kind: m.kind,
      week: m.week,
      status,
      responsesTotal: total,
      responsesDone: open ? Math.min(open.turnIndex, total) : 0,
      timesPractised: done.length,
      firstTry: first ? grammarResults(m, first) : null,
      latest: last ? grammarResults(m, last) : null,
    };
  };

  const markPractised = (state: MockState) => {
    const day = todayIso();
    if (!state.practiceDays.includes(day)) state.practiceDays.push(day);
  };

  const allowedLine = (state: MockState, text: string): string | null => {
    for (const m of MOMENTS) {
      if (m.turns.some((t) => (t.hint.kind === 'sentence' ? t.hint.text === text : t.hint.options.includes(text)))) return 'hint';
      if (m.lesson?.phrases.some((p) => p.text === text)) return 'lesson';
    }
    const fixes = Object.values(state.runs).flatMap((runs) => runs.flatMap((r) => r.replies.map((x) => x.feedback.fix?.better)));
    if (fixes.includes(text)) return 'fix';
    if (state.stories.some((s) => s.betterLine === text || s.fix?.better === text)) return 'story';
    return null;
  };

  return {
    async getHome(): Promise<Home> {
      const state = load();
      const ps = stateOf(state);
      const unfinished = programme.find((m) => runsOf(state, m.id).some((r) => !r.completed && r.kind === 'full'));
      const hardest = programme.find((m) => m.id === state.hardestMomentId && !isDone(state, m.id));
      const week = programme.filter((m) => m.week === ps.week);
      const pick = week.find((m) => !isDone(state, m.id)) ?? week[0];
      let recommended: Home['recommended'] = null;
      if (unfinished) recommended = { momentId: unfinished.id, title: unfinished.title, reason: 'continue' };
      else if (hardest) recommended = { momentId: hardest.id, title: hardest.title, reason: 'hardest' };
      else if (pick) recommended = { momentId: pick.id, title: pick.title, reason: ps.harderToday ? 'harder' : 'week' };
      const toldToday = state.stories.some((s) => (s.createdAt ?? '').startsWith(todayIso()));
      return wait({
        learner: LEARNER,
        consented: state.consented,
        baselineDone: !baseline || isDone(state, baseline.id),
        programme: { ...ps, totalDays: PROGRAMME_DAYS, weekTitle: WEEK_TITLES[ps.week] ?? '' },
        streak: { days: streak(state.practiceDays, todayIso()), practisedToday: ps.practisedToday },
        recommended,
        storySuggested: ps.harderToday && !toldToday,
        certificateEarned: state.certificateEarnedAt !== null,
      });
    },

    async onboard(input) {
      const state = load();
      state.consented = true;
      state.hardestMomentId = input.hardestMomentId;
      save(state);
      return wait(prefsOf(state));
    },

    async getPreferences() {
      return wait(prefsOf(load()));
    },

    async savePreferences(update) {
      const state = load();
      if (update.quietMode !== undefined) state.quietMode = update.quietMode;
      if (update.clearNudge) state.nudgeTime = null;
      else if (update.nudgeTime) state.nudgeTime = update.nudgeTime;
      if (update.hardestMomentId !== undefined) state.hardestMomentId = update.hardestMomentId || null;
      save(state);
      return wait(prefsOf(state));
    },

    async deleteMyData() {
      const state = load();
      const fresh = emptyState();
      save({
        ...fresh,
        consented: state.consented,
        quietMode: state.quietMode,
        nudgeTime: state.nudgeTime,
        hardestMomentId: state.hardestMomentId,
        runs: baseline ? { [baseline.id]: runsOf(state, baseline.id) } : {},
      });
      return wait(undefined);
    },

    async getProgress(): Promise<Progress> {
      const state = load();
      const days = state.practiceDays.length;
      return wait({
        learner: LEARNER,
        moments: MOMENTS.filter((m) => m.kind !== 'baseline').map((m) => progressOf(state, m)),
        trends: { daysPractised: days, fillers: null, grammarSlips: days >= 2 ? 'fewer' : null },
      });
    },

    async getMoment(id) {
      return wait(toPublicMoment(findMoment(id)));
    },

    async getRun(id) {
      const m = findMoment(id);
      const state = load();
      const runs = runsOf(state, id);
      const run = openRun(state, id) ?? runs[runs.length - 1] ?? null;
      return wait(run ? toRun(m, run) : null);
    },

    async startRun(id, options) {
      const m = findMoment(id);
      const state = load();
      requireConsent(state);
      if (!isUnlocked(state, m)) throw new ApiError('This moment is still locked', 423, 'locked');
      const kind = options?.quick ? 'quick' : 'full';
      const runs = runsOf(state, id);
      const existing = runs.find((r) => !r.completed);
      if (existing && existing.kind === kind && !options?.restart) return wait(toRun(m, existing));
      const kept = runs.filter((r) => r.completed);
      const stored = state.levels[id] ?? 1;
      const harder = m.kind === 'programme' && kind === 'full' && stateOf(state).harderToday;
      const run: StoredRun = {
        runNumber: (runs[runs.length - 1]?.runNumber ?? 0) + 1,
        turnIndex: 0,
        completed: false,
        kind,
        level: m.kind === 'baseline' ? 1 : Math.min(MAX_LEVEL, stored + (harder ? 1 : 0)),
        replies: [],
        firstAttempts: {},
      };
      state.runs[id] = [...kept, run];
      save(state);
      return wait(toRun(m, run));
    },

    async submitReply(id, input: SubmitReplyInput): Promise<Reply> {
      const m = findMoment(id);
      const state = load();
      requireConsent(state);
      const run = openRun(state, id);
      if (!run) throw new ApiError('No active practice run', 409, 'conflict');
      const turn = runTurns(m, run)[Math.min(run.turnIndex, runTurns(m, run).length - 1)];
      if (!turn || turn.id !== input.turnId) throw new ApiError('That line is no longer current', 409, 'conflict');
      // No speech-to-text in this browser: pretend the scripted demo line was said.
      const transcript = input.transcript?.trim() || (input.typed ? '' : turn.demoReply);
      const feedback = evaluateReply(turn, transcript, m.possessive === 'his' ? 'his' : 'her');
      const previous = run.replies.find((r) => r.turnId === turn.id);
      const reply: Reply = {
        id: feedback.heard ? state.nextId++ : null,
        turnId: turn.id,
        transcript,
        feedback,
        attempt: (previous?.attempt ?? 0) + 1,
        typed: Boolean(input.typed),
      };
      if (feedback.heard) {
        run.replies = [...run.replies.filter((r) => r.turnId !== turn.id), reply];
        if (!run.firstAttempts[turn.id]) run.firstAttempts[turn.id] = { transcript, feedback };
        if (m.kind !== 'baseline') markPractised(state);
        save(state);
      }
      return wait(reply);
    },

    async advance(id) {
      const m = findMoment(id);
      const state = load();
      const run = openRun(state, id);
      if (!run) throw new ApiError('No active practice run', 409, 'conflict');
      const turns = runTurns(m, run);
      const turn = turns[run.turnIndex];
      if (!turn || !run.replies.some((r) => r.turnId === turn.id)) throw new ApiError('Reply to this line first', 409, 'conflict');
      if (run.turnIndex >= turns.length - 1) {
        run.completed = true;
        if (run.kind === 'full' && m.kind !== 'baseline') {
          const right = turns.filter((t) => run.firstAttempts[t.id]?.feedback.fix === null).length / turns.length;
          const current = state.levels[id] ?? 1;
          if (right >= 0.75) state.levels[id] = Math.min(MAX_LEVEL, Math.max(current, run.level <= current ? run.level + 1 : run.level));
          else state.levels[id] = current;
        }
        if (!state.certificateEarnedAt && stateOf(state).complete) state.certificateEarnedAt = new Date().toISOString();
      } else run.turnIndex += 1;
      save(state);
      return wait(toRun(m, run));
    },

    async getSummary(id): Promise<Summary> {
      const m = findMoment(id);
      const state = load();
      const done = runsOf(state, id).filter((r) => r.completed);
      const last = done[done.length - 1];
      if (!last) throw new ApiError('Finish this moment to see a summary', 404, 'not_found');
      const previous = done.slice(0, -1).filter((r) => r.kind === last.kind);
      const before = previous[previous.length - 1];
      const fullDone = done.filter((r) => r.kind === 'full');
      const firstCompletion = last.kind === 'full' && fullDone.length === 1;
      const later = programme.filter((x) => x.order > m.order);
      const next = m.kind === 'programme' ? (later[0] ?? null) : null;
      const unlocked = firstCompletion
        ? (programme.find((x) => x.id !== id && isUnlocked(state, x) && !isUnlocked(state, x, id)) ?? null)
        : null;
      const fixesOf = (run: StoredRun) =>
        runTurns(m, run).flatMap((t) => {
          const first = run.firstAttempts[t.id];
          return first?.feedback.fix ? [{ turnId: t.id, transcript: first.transcript, fix: first.feedback.fix, tip: first.feedback.tip ?? null }] : [];
        });
      return wait({
        momentId: id,
        title: m.title,
        firstCompletion,
        unlocked: unlocked ? { id: unlocked.id, title: unlocked.title } : null,
        nextMomentId: next?.id ?? null,
        practise: fixesOf(last),
        previousPractiseCount: before ? fixesOf(before).length : null,
      });
    },

    async getPhrasebook(): Promise<Phrase[]> {
      return wait([...load().phrasebook].reverse());
    },

    async savePhrase(text, momentId) {
      const state = load();
      const existing = state.phrasebook.find((p) => p.text === text.trim());
      if (existing) return wait(existing);
      const source = allowedLine(state, text.trim());
      if (!source) throw new ApiError('Only lines from your practice can be saved', 404, 'not_found');
      const phrase: Phrase = { id: state.nextId++, text: text.trim(), source, momentId: momentId ?? null, createdAt: new Date().toISOString() };
      state.phrasebook.push(phrase);
      save(state);
      return wait(phrase);
    },

    async deletePhrase(id) {
      const state = load();
      state.phrasebook = state.phrasebook.filter((p) => p.id !== id);
      save(state);
      return wait(undefined);
    },

    async getStories() {
      return wait([...load().stories].reverse());
    },

    async tellStory(text): Promise<Story> {
      const state = load();
      requireConsent(state);
      const clean = text.trim().replace(/\b(named|called|name is)\s+[A-Z][a-z]+/g, '$1 [name]');
      if (clean.split(/\s+/).length < 3) {
        return wait({ id: null, heard: false, transcript: '', positives: [], fix: null, tip: null, betterLine: null, createdAt: null });
      }
      const agreement = /\b(he|she) (eat|play|sleep|cry)\b/i.exec(clean);
      const story: Story = {
        id: state.nextId++,
        heard: true,
        transcript: clean,
        positives: ['You explained it clearly'],
        fix: agreement ? { wrong: agreement[0], better: `${capitalise(agreement[1] ?? '')} ${agreement[2] ?? ''}s well.` } : null,
        tip: agreement ? 'With he or she, add -s: “She eats”, “He plays”.' : null,
        betterLine: 'Thank you for asking. She had a good day and enjoyed her lunch.',
        createdAt: `${todayIso()}T12:00:00`,
      };
      state.stories.push(story);
      markPractised(state);
      save(state);
      return wait(story);
    },

    async deleteStory(id) {
      const state = load();
      state.stories = state.stories.filter((s) => s.id !== id);
      save(state);
      return wait(undefined);
    },

    async getCertificate(): Promise<Certificate> {
      const state = load();
      const ps = stateOf(state);
      if (!state.certificateEarnedAt && ps.complete) {
        state.certificateEarnedAt = new Date().toISOString();
        save(state);
      }
      return wait({
        earned: state.certificateEarnedAt !== null,
        name: `${LEARNER.firstName} Sharma`,
        earnedAt: state.certificateEarnedAt,
        moments: programme.map((m) => m.title),
        daysPractised: ps.daysPractised,
        daysNeeded: Math.max(0, PROGRAMME_DAYS - ps.daysPractised),
        momentsLeft: programme.filter((m) => !isDone(state, m.id)).map((m) => m.title),
      });
    },

    reset() {
      storage.removeItem(STORAGE_KEY);
    },

    /** Recreates the "14 Journey, in progress" state from the design, for demos and reviews. */
    seedDemoProgress() {
      const state = onboardedState();
      state.consented = true;
      const runsFor = (m: MockMoment, count: number, wrongFirst: string[], wrongLatest: string[]): StoredRun[] =>
        Array.from({ length: count }, (_, i) => {
          const wrong = i === count - 1 && count > 1 ? wrongLatest : wrongFirst;
          const run: StoredRun = { runNumber: i + 1, turnIndex: 0, completed: true, kind: 'full', level: 1, replies: [], firstAttempts: {} };
          const turns = runTurns(m, run);
          run.turnIndex = turns.length - 1;
          run.replies = turns.map((t) => {
            const said = wrong.includes(t.id) ? t.demoReply : t.hint.kind === 'sentence' ? t.hint.text : t.demoReply;
            const feedback = evaluateReply(t, said, m.possessive === 'his' ? 'his' : 'her');
            run.firstAttempts[t.id] = { transcript: said, feedback };
            return { id: state.nextId++, turnId: t.id, transcript: said, feedback, attempt: 1 };
          });
          return run;
        });
      const [mg, pu, pm] = programme as [MockMoment, MockMoment, MockMoment];
      const [pmRun] = runsFor(pm, 1, ['pm-4'], []);
      if (!pmRun) return;
      state.runs[mg.id] = runsFor(mg, 3, ['mg-1', 'mg-3'], ['mg-1']);
      state.runs[pu.id] = runsFor(pu, 1, ['pu-1', 'pu-2', 'pu-5'], []);
      state.runs[pm.id] = [{ ...pmRun, completed: false, turnIndex: 4, replies: pmRun.replies.slice(0, 4) }];
      const day = today();
      state.practiceDays = Array.from({ length: 6 }, (_, i) => isoDay(new Date(day.getFullYear(), day.getMonth(), day.getDate() - i - 1)));
      save(state);
    },
  };

  function capitalise(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  function prefsOf(state: MockState): Preferences {
    return {
      quietMode: state.quietMode,
      nudgeTime: state.nudgeTime,
      hardestMomentId: state.hardestMomentId,
      consented: state.consented,
    };
  }
}
