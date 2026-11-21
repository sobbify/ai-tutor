import type { GrammarFix, Moment, Turn } from '@/types/tutor';
import script from '../../../content/moments.json';

/**
 * Practice scripts for the in-browser mock API, loaded from `content/moments.json` — the same
 * file the FastAPI journey router reads, so both modes always practise the same lines.
 *
 * `demoReply` is only used when the browser can't transcribe speech (no Web Speech API, e.g.
 * inside Electron): the mock then pretends the teacher said this line, so the whole flow can be
 * demoed end to end. The real backend transcribes the uploaded audio instead.
 */
export interface MockTurn extends Turn {
  demoReply: string;
  /** 1 calm · 2 surprise follow-up · 3 worried · 4 upset or fast-talking. */
  minLevel: number;
  /** Mistakes the mock evaluator recognises for this line, on top of the generic rules. */
  knownFixes?: Array<{ pattern: RegExp } & GrammarFix>;
}

export interface MockMoment extends Omit<Moment, 'turns'> {
  turns: MockTurn[];
  /** Possessive pronoun for the character, used in feedback ("You answered her question"). */
  possessive: 'her' | 'his';
}

interface RawTurn extends Omit<MockTurn, 'knownFixes'> {
  knownFixes?: Array<{ pattern: string } & GrammarFix>;
}

export const MOMENTS: MockMoment[] = script.moments.map((m) => ({
  ...(m as unknown as Omit<MockMoment, 'turns'>),
  turns: (m.turns as RawTurn[]).map((t) => ({
    ...t,
    knownFixes: t.knownFixes?.map((k) => ({ ...k, pattern: new RegExp(k.pattern, 'i') })),
  })),
}));

export const LEARNER: { firstName: string } = script.learner;
