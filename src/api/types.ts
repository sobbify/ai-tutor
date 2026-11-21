import type {
  Certificate,
  Home,
  Moment,
  MomentId,
  OnboardingInput,
  Phrase,
  Preferences,
  PreferencesUpdate,
  Progress,
  Reply,
  Run,
  Story,
  Summary,
} from '@/types/tutor';

export interface SubmitReplyInput {
  turnId: string;
  /** Recorded audio. The real backend transcribes and evaluates it. */
  audio: Blob | null;
  /** Browser-side transcript when available (Web Speech API), or her typed reply. */
  transcript: string | null;
  /** Typing fallback (quiet mode): the transcript is what she typed. */
  typed?: boolean;
}

/**
 * Everything the UI needs from the tutor backend. Two implementations:
 * - `createMockApi` — in-browser, demo data in localStorage (default; no backend needed)
 * - `createHttpApi` — FastAPI backend (`VITE_API_MODE=http`)
 */
export interface TutorApi {
  getHome(): Promise<Home>;
  onboard(input: OnboardingInput): Promise<Preferences>;
  getPreferences(): Promise<Preferences>;
  savePreferences(update: PreferencesUpdate): Promise<Preferences>;
  /** Deletes her practice history, stories and phrasebook (keeps her consent). */
  deleteMyData(): Promise<void>;
  getProgress(): Promise<Progress>;
  getMoment(momentId: MomentId): Promise<Moment>;
  /** The unfinished run, else the latest completed one; null if never practised. */
  getRun(momentId: MomentId): Promise<Run | null>;
  /** Resume the unfinished run, or start a new one (`restart` always starts fresh; `quick` = Rehearse now). */
  startRun(momentId: MomentId, options?: { restart?: boolean; quick?: boolean }): Promise<Run>;
  submitReply(momentId: MomentId, input: SubmitReplyInput): Promise<Reply>;
  /** Accept the current reply and move to the next line; completes the run after the last one. */
  advance(momentId: MomentId): Promise<Run>;
  /** Summary of the latest completed run. */
  getSummary(momentId: MomentId): Promise<Summary>;
  getPhrasebook(): Promise<Phrase[]>;
  savePhrase(text: string, momentId?: MomentId | null): Promise<Phrase>;
  deletePhrase(id: number): Promise<void>;
  getStories(): Promise<Story[]>;
  /** "Tell me what happened", typed. Spoken stories go over the realtime socket. */
  tellStory(text: string): Promise<Story>;
  deleteStory(id: number): Promise<void>;
  getCertificate(): Promise<Certificate>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code:
      | 'forbidden'
      | 'not_found'
      | 'locked'
      | 'conflict'
      | 'consent_required'
      | 'rate_limited'
      | 'unavailable'
      | 'network'
      | 'invalid_response'
      | 'server',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
