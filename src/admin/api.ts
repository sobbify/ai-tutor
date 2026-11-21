import { z } from 'zod';
import { MomentIconSchema, MomentProgressSchema } from '@/types/tutor';

/**
 * Admin console API (backend/src/ai_tutor/api/admin.py). Cookie-authenticated (`ai_tutor_admin`,
 * HttpOnly, SameSite=Strict, Path=/api/admin); every response is zod-validated.
 */

export class AdminApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

const ROOT = '/api/admin';

async function call<S extends z.ZodType>(path: string, schema: S, init: RequestInit = {}): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`${ROOT}${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'ai-tutor',
        ...(init.body && typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new AdminApiError('Could not reach the server.', 0);
  }
  if (res.status === 204) return undefined as z.infer<S>;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string' ? body.detail : 'Something went wrong.';
    throw new AdminApiError(detail, res.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new AdminApiError('The server sent an unexpected response.', res.status);
  return parsed.data;
}

const json = (method: string, data?: unknown): RequestInit => ({ method, body: data === undefined ? undefined : JSON.stringify(data) });
const qs = (params: Record<string, string | number | null | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : '';
};

/** Triggers a browser download of a JSON endpoint (export / backup). */
export async function download(path: string, fallbackName: string) {
  const res = await fetch(`${ROOT}${path}`, { credentials: 'same-origin', headers: { 'X-Requested-With': 'ai-tutor' } });
  if (!res.ok) throw new AdminApiError('Download failed.', res.status);
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- schemas -------------------------------------------------------------------------------

const date = z.string();
export const pageOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), total: z.number(), page: z.number(), size: z.number() });

export const AdminMeSchema = z.object({ username: z.string() });

export const StatsSchema = z.object({
  kpis: z.object({
    learners: z.number(),
    activeLearnersWeek: z.number(),
    signedInNow: z.number(),
    repliesTotal: z.number(),
    repliesWeek: z.number(),
    completedRuns: z.number(),
    accuracyMonth: z.number().nullable(),
    avgEvalMs: z.number().nullable(),
  }),
  activity: z.array(z.object({ date: z.string(), replies: z.number(), learners: z.number() })),
  moments: z.array(z.object({ id: z.string(), title: z.string(), learnersStarted: z.number(), completions: z.number(), accuracy: z.number().nullable() })),
  topFixes: z.array(z.object({ wrong: z.string(), better: z.string(), count: z.number() })),
});
export type Stats = z.infer<typeof StatsSchema>;

export const LearnerRowSchema = z.object({
  uid: z.string(),
  name: z.string(),
  createdAt: date,
  lastSeenAt: date,
  momentsDone: z.number(),
  replies: z.number(),
  accuracy: z.number().nullable(),
});
export type LearnerRow = z.infer<typeof LearnerRowSchema>;

export const ReplyRowSchema = z.object({
  id: z.number(),
  learnerUid: z.string(),
  learnerName: z.string(),
  momentId: z.string(),
  momentTitle: z.string(),
  turnId: z.string(),
  parentLine: z.string(),
  transcript: z.string(),
  attempt: z.number(),
  fixWrong: z.string().nullable(),
  fixBetter: z.string().nullable(),
  positives: z.array(z.string()),
  evaluator: z.string(),
  latencyMs: z.number(),
  createdAt: date,
});
export type ReplyRow = z.infer<typeof ReplyRowSchema>;

export const LearnerDetailSchema = z.object({
  uid: z.string(),
  name: z.string(),
  createdAt: date,
  lastSeenAt: date,
  sessions: z.array(z.object({ createdAt: date, lastUsedAt: date, expiresAt: date, userAgent: z.string() })),
  progress: z.array(MomentProgressSchema),
  recentReplies: z.array(ReplyRowSchema),
});
export type LearnerDetail = z.infer<typeof LearnerDetailSchema>;

export const MomentRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number(),
  icon: z.string(),
  kind: z.string().optional(),
  week: z.number().nullable().optional(),
  published: z.boolean(),
  lines: z.number(),
  videos: z.number(),
  learnersStarted: z.number(),
  updatedAt: date,
});
export type MomentRow = z.infer<typeof MomentRowSchema>;

const KnownFixSchema = z.object({ pattern: z.string(), wrong: z.string(), better: z.string() });
export const EditableTurnSchema = z.object({
  id: z.string(),
  parentLine: z.string(),
  hint: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('sentence'), text: z.string() }),
    z.object({ kind: z.literal('starters'), options: z.array(z.string()) }),
  ]),
  videoUrl: z.string().nullable(),
  demoReply: z.string(),
  knownFixes: z.array(KnownFixSchema),
  minLevel: z.number().int().min(1).max(4),
});
export type EditableTurn = z.infer<typeof EditableTurnSchema>;

export const EditableMomentSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number(),
  icon: MomentIconSchema,
  scene: z.string(),
  character: z.object({ name: z.string(), role: z.string(), initials: z.string(), posterUrl: z.string().nullable() }),
  possessive: z.enum(['her', 'his', 'their']),
  published: z.boolean(),
  kind: z.enum(['programme', 'anytime', 'baseline']),
  week: z.number().int().min(1).max(3).nullable(),
  lesson: z
    .object({
      title: z.string(),
      intro: z.string(),
      phrases: z.array(z.object({ text: z.string(), note: z.string() })),
      tip: z.string(),
    })
    .nullable(),
  turns: z.array(EditableTurnSchema),
});
export type EditableMoment = z.infer<typeof EditableMomentSchema>;

export const AuditRowSchema = z.object({
  id: z.number(),
  adminUsername: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  detail: z.record(z.string(), z.unknown()),
  createdAt: date,
});
export type AuditRow = z.infer<typeof AuditRowSchema>;

export const AdminRowSchema = z.object({ username: z.string(), isActive: z.boolean(), createdAt: date, lastLoginAt: date.nullable() });
export type AdminRow = z.infer<typeof AdminRowSchema>;

// ---- endpoints -----------------------------------------------------------------------------

export type LearnerSort = 'last_seen' | 'name' | 'created' | 'replies';
export type ReplyOutcome = 'all' | 'fix' | 'clean';

export const NudgeSettingsSchema = z.object({ encouragement: z.string(), holidays: z.array(z.string()) });
export type NudgeSettings = z.infer<typeof NudgeSettingsSchema>;

export const adminApi = {
  login: (username: string, password: string) => call('/login', AdminMeSchema, json('POST', { username, password })),
  logout: () => call('/logout', z.undefined(), json('POST')),
  me: () => call('/me', AdminMeSchema),
  session: () => call('/session', z.object({ username: z.string().nullable() })),
  changePassword: (currentPassword: string, newPassword: string) =>
    call('/me/password', z.undefined(), json('POST', { currentPassword, newPassword })),

  stats: () => call('/stats', StatsSchema),

  learners: (p: { q: string; sort: LearnerSort; page: number; size: number }) => call(`/learners${qs(p)}`, pageOf(LearnerRowSchema)),
  learner: (uid: string) => call(`/learners/${encodeURIComponent(uid)}`, LearnerDetailSchema),
  renameLearner: (uid: string, name: string) => call(`/learners/${encodeURIComponent(uid)}`, LearnerDetailSchema, json('PATCH', { name })),
  resetLearner: (uid: string, momentId: string | null) =>
    call(`/learners/${encodeURIComponent(uid)}/reset`, z.object({ runsDeleted: z.number() }), json('POST', { momentId })),
  signOutLearner: (uid: string) => call(`/learners/${encodeURIComponent(uid)}/signout`, z.object({ sessionsEnded: z.number() }), json('POST')),
  deleteLearner: (uid: string) => call(`/learners/${encodeURIComponent(uid)}${qs({ confirm: uid })}`, z.undefined(), json('DELETE')),

  replies: (p: { q: string; moment: string; outcome: ReplyOutcome; learner?: string; page: number; size: number }) =>
    call(`/replies${qs(p)}`, pageOf(ReplyRowSchema)),

  moments: () => call('/moments', z.array(MomentRowSchema)),
  moment: (id: string) => call(`/moments/${encodeURIComponent(id)}`, EditableMomentSchema),
  saveMoment: (m: EditableMoment) => call(`/moments/${encodeURIComponent(m.id)}`, EditableMomentSchema, json('PUT', m)),
  createMoment: (m: EditableMoment) => call('/moments', EditableMomentSchema, json('POST', m)),
  deleteMoment: (id: string) => call(`/moments/${encodeURIComponent(id)}${qs({ confirm: id })}`, z.undefined(), json('DELETE')),
  importContent: (data: unknown) => call('/content/import', z.object({ created: z.number(), updated: z.number() }), json('POST', data)),

  audit: (p: { page: number; size: number; action?: string }) => call(`/audit${qs(p)}`, pageOf(AuditRowSchema)),
  admins: () => call('/admins', z.array(AdminRowSchema)),
  createAdmin: (username: string, password: string) => call('/admins', AdminRowSchema, json('POST', { username, password })),
  deleteAdmin: (username: string) => call(`/admins/${encodeURIComponent(username)}`, z.undefined(), json('DELETE')),

  nudgeSettings: () => call('/nudge-settings', NudgeSettingsSchema),
  saveNudgeSettings: (s: NudgeSettings) => call('/nudge-settings', NudgeSettingsSchema, json('PUT', s)),
};
