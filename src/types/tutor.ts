import { z } from 'zod';

// No eval/new Function: keeps the strict Content-Security-Policy (script-src 'self') clean.
z.config({ jitless: true });

/**
 * Domain model + runtime schemas. The HTTP client parses every response with these,
 * so a backend change can never push malformed data into the UI.
 */

export const MomentIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);
export type MomentId = z.infer<typeof MomentIdSchema>;

export const HintSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sentence'), text: z.string() }),
  z.object({ kind: z.literal('starters'), options: z.array(z.string()).min(1) }),
]);
export type Hint = z.infer<typeof HintSchema>;

export const TurnSchema = z.object({
  id: z.string(),
  parentLine: z.string(),
  hint: HintSchema,
  /** Avatar-provider clip for this line. Null until the provider is wired in. */
  videoUrl: z.string().url().nullable(),
  /** How the parent comes across on this line (drives the illustrated avatar's face). */
  mood: z.enum(['calm', 'worried', 'upset']).default('calm'),
});
export type Turn = z.infer<typeof TurnSchema>;
export type Mood = Turn['mood'];

export const CharacterSchema = z.object({
  name: z.string(),
  role: z.string(),
  initials: z.string().max(3),
  posterUrl: z.string().url().nullable(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const MomentIconSchema = z.enum(['sun', 'backpack', 'chat', 'handshake', 'school', 'phone', 'bandage', 'star']);
export type MomentIcon = z.infer<typeof MomentIconSchema>;

/** programme = the 15-day course (by week) · anytime = rehearse on demand · baseline = the first chat */
export const MomentKindSchema = z.enum(['programme', 'anytime', 'baseline']);
export type MomentKind = z.infer<typeof MomentKindSchema>;

/** The "Learn" step before a role-play: key phrases and one grammar tip. */
export const LessonSchema = z.object({
  title: z.string(),
  intro: z.string(),
  phrases: z.array(z.object({ text: z.string(), note: z.string() })),
  tip: z.string(),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const MomentSchema = z.object({
  id: MomentIdSchema,
  title: z.string(),
  order: z.number().int().min(1),
  icon: MomentIconSchema,
  kind: MomentKindSchema,
  week: z.number().int().min(1).max(3).nullable(),
  scene: z.string(),
  character: CharacterSchema,
  lesson: LessonSchema.nullable(),
  turns: z.array(TurnSchema).min(1),
});
export type Moment = z.infer<typeof MomentSchema>;

export const GrammarFixSchema = z.object({
  /** Exact phrase from the transcript to underline / strike. */
  wrong: z.string(),
  /** Full corrected sentence to say instead. */
  better: z.string(),
});
export type GrammarFix = z.infer<typeof GrammarFixSchema>;

/** Another slip in the same reply: one change, with its own rule and category. */
export const SlipSchema = z.object({
  wrong: z.string(),
  better: z.string(),
  tip: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
});
export type Slip = z.infer<typeof SlipSchema>;

export const FeedbackSchema = z.object({
  heard: z.boolean(),
  positives: z.array(z.string()),
  fix: GrammarFixSchema.nullable(),
  /** One-line grammar micro-lesson that comes with a fix. */
  tip: z.string().nullable().optional(),
  /** What kind of slip the fix is about: tense, agreement, article, preposition, … */
  category: z.string().nullable().optional(),
  /** Every other slip in the reply, most important first (up to 3). */
  moreFixes: z.array(SlipSchema).optional(),
  /** Her whole reply with every slip fixed, when there are several. */
  corrected: z.string().nullable().optional(),
});
export type Feedback = z.infer<typeof FeedbackSchema>;

export const ReplySchema = z.object({
  /** Null when nothing was stored (not heard). */
  id: z.number().int().nullable().optional(),
  turnId: z.string(),
  transcript: z.string(),
  feedback: FeedbackSchema,
  attempt: z.number().int().min(1),
  typed: z.boolean().optional(),
});
export type Reply = z.infer<typeof ReplySchema>;

export const RunSchema = z.object({
  momentId: MomentIdSchema,
  runNumber: z.number().int().min(1),
  turnIndex: z.number().int().min(0),
  /** This run's lines, in order (they follow its hidden difficulty, or "Rehearse now"). */
  turnIds: z.array(z.string()).min(1),
  kind: z.enum(['full', 'quick']),
  /** Latest reply per turn, in turn order. */
  replies: z.array(ReplySchema),
  completed: z.boolean(),
});
export type Run = z.infer<typeof RunSchema>;

export const MomentStatusSchema = z.enum(['locked', 'available', 'in_progress', 'done']);
export type MomentStatus = z.infer<typeof MomentStatusSchema>;

export const MomentProgressSchema = z.object({
  id: MomentIdSchema,
  title: z.string(),
  order: z.number().int(),
  icon: MomentIconSchema,
  kind: MomentKindSchema,
  week: z.number().int().nullable(),
  status: MomentStatusSchema,
  responsesTotal: z.number().int().min(1),
  /** Turns completed in the current (unfinished) run. */
  responsesDone: z.number().int().min(0),
  timesPractised: z.number().int().min(0),
  /** Per-turn grammar result (true = correct) on the first completed run, and on the latest. */
  firstTry: z.array(z.boolean()).nullable(),
  latest: z.array(z.boolean()).nullable(),
});
export type MomentProgress = z.infer<typeof MomentProgressSchema>;

const TrendSchema = z.enum(['fewer', 'same', 'more']).nullable();

/** Gentle trends: her first sessions against her latest — never a grade. */
export const TrendsSchema = z.object({
  daysPractised: z.number().int().min(0),
  fillers: TrendSchema,
  grammarSlips: TrendSchema,
});
export type Trends = z.infer<typeof TrendsSchema>;

export const ProgressSchema = z.object({
  learner: z.object({ firstName: z.string() }),
  moments: z.array(MomentProgressSchema),
  trends: TrendsSchema,
});
export type Progress = z.infer<typeof ProgressSchema>;

export const PractiseItemSchema = z.object({
  turnId: z.string(),
  transcript: z.string(),
  fix: GrammarFixSchema,
  tip: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  moreFixes: z.array(SlipSchema).optional(),
  corrected: z.string().nullable().optional(),
});
export type PractiseItem = z.infer<typeof PractiseItemSchema>;

// ---- snowflakes (XP for effort, never for accuracy) -----------------------------------------------

export const SnowflakeItemSchema = z.object({
  kind: z.enum(['finished', 'quick', 'again', 'story', 'daily']),
  amount: z.number().int().min(0),
});
export type SnowflakeItem = z.infer<typeof SnowflakeItemSchema>;

/** What one session earned (its end screen, like Duolingo's XP) and her week so far. */
export const SnowflakesEarnedSchema = z.object({
  earned: z.number().int().min(0),
  items: z.array(SnowflakeItemSchema),
  week: z.number().int().min(0),
});
export type SnowflakesEarned = z.infer<typeof SnowflakesEarnedSchema>;

export const SummarySchema = z.object({
  momentId: MomentIdSchema,
  title: z.string(),
  /** True right after the first ever completion of this moment. */
  firstCompletion: z.boolean(),
  unlocked: z.object({ id: MomentIdSchema, title: z.string() }).nullable(),
  nextMomentId: MomentIdSchema.nullable(),
  practise: z.array(PractiseItemSchema),
  /** How many sentences to practise there were on the previous run (null on the first run). */
  previousPractiseCount: z.number().int().min(0).nullable(),
  snowflakes: SnowflakesEarnedSchema.nullable().optional(),
});
export type Summary = z.infer<typeof SummarySchema>;

// ---- home, onboarding, preferences ---------------------------------------------------------------

export const HomeSchema = z.object({
  learner: z.object({ firstName: z.string() }),
  consented: z.boolean(),
  baselineDone: z.boolean(),
  programme: z.object({
    day: z.number().int().min(1),
    totalDays: z.number().int().min(1),
    week: z.number().int().min(1),
    weekTitle: z.string(),
    daysPractised: z.number().int().min(0),
    practisedToday: z.boolean(),
    /** Day 5 of a week: a harder role-play, and "Tell me what happened". */
    harderToday: z.boolean(),
    complete: z.boolean(),
  }),
  streak: z.object({ days: z.number().int().min(0), practisedToday: z.boolean() }),
  recommended: z
    .object({ momentId: MomentIdSchema, title: z.string(), reason: z.enum(['continue', 'hardest', 'week', 'harder']) })
    .nullable(),
  storySuggested: z.boolean(),
  certificateEarned: z.boolean(),
  snowflakes: z.object({ total: z.number().int().min(0), week: z.number().int().min(0) }).default({ total: 0, week: 0 }),
  group: z
    .object({ name: z.string(), members: z.number().int().min(1), weekTotal: z.number().int().min(0), weekGoal: z.number().int().min(0) })
    .nullable()
    .default(null),
  /** The PRD's group invite: once she finishes the programme, or 30 days after joining. */
  groupInvite: z.boolean().default(false),
});
export type Home = z.infer<typeof HomeSchema>;

export const PreferencesSchema = z.object({
  quietMode: z.boolean(),
  nudgeTime: z.string().nullable(),
  hardestMomentId: z.string().nullable(),
  consented: z.boolean(),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export interface PreferencesUpdate {
  quietMode?: boolean;
  nudgeTime?: string;
  clearNudge?: boolean;
  hardestMomentId?: string;
}

export interface OnboardingInput {
  consent: true;
  hardestMomentId: string | null;
}

// ---- phrasebook, stories, certificate ------------------------------------------------------------

export const PhraseSchema = z.object({
  id: z.number().int(),
  text: z.string(),
  source: z.string(),
  momentId: z.string().nullable(),
  createdAt: z.string(),
});
export type Phrase = z.infer<typeof PhraseSchema>;

export const StorySchema = z.object({
  id: z.number().int().nullable(),
  heard: z.boolean(),
  transcript: z.string(),
  positives: z.array(z.string()),
  fix: GrammarFixSchema.nullable(),
  tip: z.string().nullable(),
  betterLine: z.string().nullable(),
  createdAt: z.string().nullable(),
  snowflakes: z.number().int().min(0).default(0),
  category: z.string().nullable().optional(),
  moreFixes: z.array(SlipSchema).optional(),
  corrected: z.string().nullable().optional(),
});
export type Story = z.infer<typeof StorySchema>;

export const CertificateSchema = z.object({
  earned: z.boolean(),
  name: z.string(),
  earnedAt: z.string().nullable(),
  moments: z.array(z.string()),
  daysPractised: z.number().int().min(0),
  daysNeeded: z.number().int().min(0),
  momentsLeft: z.array(z.string()),
});
export type Certificate = z.infer<typeof CertificateSchema>;

// ---- practice groups (named; up to 5 teachers from one centre) --------------------------------------

/** What members see of each other: name and effort. Never feedback, transcripts or levels. */
export const GroupMemberSchema = z.object({
  name: z.string(),
  firstName: z.string(),
  isMe: z.boolean(),
  weekSnowflakes: z.number().int().min(0),
  practisedToday: z.boolean(),
});
export type GroupMember = z.infer<typeof GroupMemberSchema>;

export const GroupSchema = z.object({
  name: z.string(),
  code: z.string(),
  members: z.array(GroupMemberSchema),
  maxMembers: z.number().int().min(1),
  weekTotal: z.number().int().min(0),
  weekGoal: z.number().int().min(0),
  createdByMe: z.boolean(),
});
export type Group = z.infer<typeof GroupSchema>;

export const GroupStatusSchema = z.object({
  group: GroupSchema.nullable(),
  /** False when the host app didn't send her centre: groups only mix teachers of one centre. */
  canJoin: z.boolean(),
});
export type GroupStatus = z.infer<typeof GroupStatusSchema>;

