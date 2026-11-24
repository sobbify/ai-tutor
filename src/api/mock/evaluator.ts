import type { Feedback, Slip } from '@/types/tutor';
import type { MockTurn } from './content';

/**
 * A deliberately small, rule-based stand-in for the real grammar evaluator (Gemini on the
 * backend). It recognises the scripted mistakes plus a few common subject–verb agreement slips,
 * which is enough to exercise every feedback state in the UI.
 */

const MIN_WORDS = 2;

const THIRD_PERSON: Record<string, string> = {
  have: 'has',
  do: 'does',
  go: 'goes',
  cry: 'cries',
  try: 'tries',
  like: 'likes',
  want: 'wants',
  need: 'needs',
  feel: 'feels',
  play: 'plays',
  eat: 'eats',
  sleep: 'sleeps',
  come: 'comes',
  use: 'uses',
  know: 'knows',
  say: 'says',
  listen: 'listens',
  share: 'shares',
};

const AGREEMENT = new RegExp(`\\b(she|he|it)\\s+(${Object.keys(THIRD_PERSON).join('|')})\\b`, 'i');
const DONT = /\b(she|he|it)\s+don['’]t\b/i;

function sentenceContaining(text: string, index: number): string {
  const start = Math.max(text.lastIndexOf('.', index - 1), text.lastIndexOf('?', index - 1), text.lastIndexOf('!', index - 1)) + 1;
  const endMatch = /[.?!]/.exec(text.slice(index));
  const end = endMatch ? index + endMatch.index + 1 : text.length;
  return text.slice(start, end).trim();
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const TIPS = {
  will: ['Use “will” for promises about later: “I will call you.”', 'tense'],
  agreement: ['With he, she or it, add -s: “She likes”, “He has”.', 'agreement'],
  other: ['Keep your sentence, change only the word that is wrong.', 'grammar'],
} as const;

/** A slip plus, when it's a word swap, exactly what to swap (for the "All together" line). */
type Found = Slip & { swap?: [string, string] };

/** Every agreement slip ("she have", "he don’t"), each fixed on its own in its sentence. */
function agreementSlips(transcript: string): Found[] {
  const out: Found[] = [];
  const all = new RegExp(`${DONT.source}|${AGREEMENT.source}`, 'gi');
  for (const m of transcript.matchAll(all)) {
    const sentence = sentenceContaining(transcript, m.index);
    const [tip, category] = TIPS.agreement;
    if (DONT.test(m[0])) {
      const fixed = m[0].replace(/don['’]t/i, 'doesn’t');
      out.push({ wrong: m[0].split(/\s+/).slice(1).join(' '), better: capitalise(sentence.replace(m[0], fixed)), tip, category, swap: [m[0], fixed] });
    } else {
      const [subject = '', verb = ''] = m[0].split(/\s+/);
      const fixed = `${subject} ${THIRD_PERSON[verb.toLowerCase()] ?? verb}`;
      out.push({ wrong: verb, better: capitalise(sentence.replace(m[0], fixed)), tip, category, swap: [m[0], fixed] });
    }
  }
  return out;
}

/** Her whole reply with every slip fixed: scripted fixes replace their sentence, word swaps are
 * applied in place (so two slips in one sentence both get fixed). */
function together(transcript: string, slips: Found[]): string {
  let text = transcript;
  for (const slip of slips.filter((x) => !x.swap)) {
    const at = text.toLowerCase().indexOf(slip.wrong.toLowerCase());
    if (at >= 0) text = text.replace(sentenceContaining(text, at), slip.better);
  }
  for (const slip of slips) if (slip.swap) text = text.replace(slip.swap[0], slip.swap[1]);
  return text;
}

export function evaluateReply(turn: MockTurn, transcript: string, possessive: 'her' | 'his'): Feedback {
  const clean = transcript.trim();
  if (clean.split(/\s+/).filter(Boolean).length < MIN_WORDS) {
    return { heard: false, positives: [], fix: null, tip: null, category: null };
  }

  const slips: Found[] = (turn.knownFixes ?? [])
    .filter((k) => k.pattern.test(clean))
    .map((k) => {
      const [tip, category] = /\bwill\b/i.test(k.better) && !/\bwill\b/i.test(clean) ? TIPS.will : TIPS.other;
      return { wrong: k.wrong, better: k.better, tip, category };
    });
  for (const slip of agreementSlips(clean)) {
    if (!slips.some((s) => s.wrong.toLowerCase().split(/\s+/).includes(slip.wrong.toLowerCase()))) slips.push(slip);
  }

  const [first, ...rest] = slips.slice(0, 4);
  if (first) {
    return {
      heard: true,
      positives: [`You answered ${possessive} question clearly`],
      fix: { wrong: first.wrong, better: first.better },
      tip: first.tip ?? null,
      category: first.category ?? 'grammar',
      moreFixes: rest.map((slip): Slip => ({ wrong: slip.wrong, better: slip.better, tip: slip.tip ?? null, category: slip.category ?? 'grammar' })),
      corrected: rest.length ? together(clean, [first, ...rest]) : null,
    };
  }
  return { heard: true, positives: ['You sounded warm and kind', 'No grammar mistakes. Well said!'], fix: null, tip: null, category: null };
}
