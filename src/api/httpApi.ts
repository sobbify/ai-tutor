import { z } from 'zod';
import {
  CertificateSchema,
  HomeSchema,
  MomentSchema,
  PhraseSchema,
  PreferencesSchema,
  ProgressSchema,
  ReplySchema,
  RunSchema,
  StorySchema,
  SummarySchema,
  type MomentId,
} from '@/types/tutor';
import { notifySessionLost } from './session';
import { ApiError, type SubmitReplyInput, type TutorApi } from './types';

/**
 * FastAPI client. Contract (all JSON, snake_case is mapped by the backend to these shapes):
 *
 *   GET  /api/tutor/progress                      → Progress
 *   GET  /api/tutor/moments/{id}                  → Moment
 *   GET  /api/tutor/moments/{id}/run              → Run (unfinished, else latest) | 204 (never practised)
 *   POST /api/tutor/moments/{id}/run              { restart } → Run
 *   POST /api/tutor/moments/{id}/replies          multipart: turn_id, audio?, transcript? → Reply
 *   POST /api/tutor/moments/{id}/advance          → Run
 *   GET  /api/tutor/moments/{id}/summary          → Summary
 *   GET  /api/tutor/home · POST /onboarding · GET/PUT /preferences · DELETE /me/data
 *   GET/POST /api/tutor/phrasebook · DELETE /phrasebook/{id} · GET /phrasebook/{id}/voice (offline)
 *   GET/POST /api/tutor/stories · DELETE /stories/{id} · GET /api/tutor/certificate
 *   POST /api/tutor/voice                         { text } → audio/wav (Gemini's voice; see lib/audio/voice.ts)
 *   WS   /ws/practice/{id}                        realtime reply capture (see hooks/useLiveReply.ts)
 *
 * Access: the host app opens `/in?uid=..&name=..`; the backend sets the HttpOnly `ai_tutor_session`
 * cookie and redirects to a bare URL. Every call here is bare (`credentials: 'same-origin'`), so
 * the uid never appears in JS or in a URL. Mutations carry `X-Requested-With` (CSRF guard).
 */

const DEFAULT_TIMEOUT_MS = 20_000;
const REPLY_TIMEOUT_MS = 45_000;

const statusCode = (status: number): ApiError['code'] => {
  // The AccessGate answers 403 when the session cookie is missing/expired.
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 423) return 'locked';
  if (status === 409) return 'conflict';
  if (status === 428) return 'consent_required';
  if (status === 429) return 'rate_limited';
  if (status === 502 || status === 503) return 'unavailable';
  return 'server';
};

const VOICE_TIMEOUT_MS = 30_000;

/** A line in Gemini's voice (WAV bytes). Only lines the app shows this learner are allowed. */
export async function fetchVoice(text: string, baseUrl: string = import.meta.env.VITE_API_BASE_URL ?? ''): Promise<ArrayBuffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VOICE_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tutor/voice`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'audio/wav', 'Content-Type': 'application/json', 'X-Requested-With': 'ai-tutor' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError('Could not reach the tutor service. Check your connection.', 0, 'network');
    }
    if (!response.ok) {
      const code = statusCode(response.status);
      if (code === 'forbidden') notifySessionLost();
      throw new ApiError('Voice is not available right now.', response.status, code);
    }
    // 204: voice is switched off on this server (offline mode).
    if (response.status === 204) throw new ApiError('Voice is switched off.', 204, 'unavailable');
    return await response.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

export function createHttpApi(baseUrl = ''): TutorApi {
  const root = `${baseUrl.replace(/\/$/, '')}/api/tutor`;
  const momentPath = (id: MomentId) => `${root}/moments/${encodeURIComponent(id)}`;

  async function request<S extends z.ZodType>(
    url: string,
    schema: S,
    init: RequestInit & { timeoutMs?: number; allowEmpty?: boolean } = {},
  ): Promise<z.infer<S>> {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, allowEmpty = false, ...rest } = init;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          // CSRF guard: the backend rejects state-changing calls without this header.
          'X-Requested-With': 'ai-tutor',
          ...(rest.body instanceof FormData || !rest.body ? {} : { 'Content-Type': 'application/json' }),
        },
        ...rest,
        signal: controller.signal,
      });
    } catch {
      throw new ApiError('Could not reach the tutor service. Check your connection.', 0, 'network');
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 204 && allowEmpty) return null as z.infer<S>;
    if (!response.ok) {
      let message = 'Something went wrong. Please try again.';
      try {
        const body: unknown = await response.json();
        if (body && typeof body === 'object' && 'detail' in body && typeof body.detail === 'string') message = body.detail;
      } catch {
        /* non-JSON error body */
      }
      const code = statusCode(response.status);
      if (code === 'forbidden') notifySessionLost();
      throw new ApiError(message, response.status, code);
    }

    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw new ApiError('The tutor service sent an unexpected response.', response.status, 'invalid_response');
    return parsed.data;
  }

  const json = (body: unknown) => JSON.stringify(body);
  const Empty = z.unknown();
  const noContent = async (url: string) => {
    await request(url, Empty, { method: 'DELETE', allowEmpty: true });
  };

  return {
    getHome: () => request(`${root}/home`, HomeSchema),
    onboard: (input) => request(`${root}/onboarding`, PreferencesSchema, { method: 'POST', body: json(input) }),
    getPreferences: () => request(`${root}/preferences`, PreferencesSchema),
    savePreferences: (update) => request(`${root}/preferences`, PreferencesSchema, { method: 'PUT', body: json(update) }),
    deleteMyData: () => noContent(`${root}/me/data`),
    getProgress: () => request(`${root}/progress`, ProgressSchema),
    getMoment: (id) => request(momentPath(id), MomentSchema),
    getRun: (id) => request(`${momentPath(id)}/run`, RunSchema.nullable(), { allowEmpty: true }),
    startRun: (id, options) =>
      request(`${momentPath(id)}/run`, RunSchema, {
        method: 'POST',
        body: json({ restart: Boolean(options?.restart), quick: Boolean(options?.quick) }),
      }),
    submitReply: (id, input: SubmitReplyInput) => {
      const form = new FormData();
      form.set('turn_id', input.turnId);
      if (input.transcript) form.set('transcript', input.transcript);
      if (input.typed) form.set('typed', 'true');
      if (input.audio) form.set('audio', input.audio, `reply.${input.audio.type.includes('mp4') ? 'm4a' : 'webm'}`);
      return request(`${momentPath(id)}/replies`, ReplySchema, { method: 'POST', body: form, timeoutMs: REPLY_TIMEOUT_MS });
    },
    advance: (id) => request(`${momentPath(id)}/advance`, RunSchema, { method: 'POST' }),
    getSummary: (id) => request(`${momentPath(id)}/summary`, SummarySchema),
    getPhrasebook: () => request(`${root}/phrasebook`, z.array(PhraseSchema)),
    savePhrase: (text, momentId) =>
      request(`${root}/phrasebook`, PhraseSchema, { method: 'POST', body: json({ text, momentId: momentId ?? null }) }),
    deletePhrase: (id) => noContent(`${root}/phrasebook/${id}`),
    getStories: () => request(`${root}/stories`, z.array(StorySchema)),
    tellStory: (text) => request(`${root}/stories`, StorySchema, { method: 'POST', body: json({ text }), timeoutMs: REPLY_TIMEOUT_MS }),
    deleteStory: (id) => noContent(`${root}/stories/${id}`),
    getCertificate: () => request(`${root}/certificate`, CertificateSchema),
  };
}

/** URLs the page fetches directly (audio elements, the offline cache). */
export const audioUrls = {
  phraseVoice: (id: number) => `${(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')}/api/tutor/phrasebook/${id}/voice`,
};
