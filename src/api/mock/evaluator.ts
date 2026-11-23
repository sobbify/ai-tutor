import type { Feedback, GrammarFix } from '@/types/tutor';
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

function genericFix(transcript: string): GrammarFix | null {
  const dont = DONT.exec(transcript);
  if (dont) {
    const original = sentenceContaining(transcript, dont.index);
    return {
      wrong: dont[0].split(/\s+/).slice(1).join(' '),
      better: capitalise(original.replace(DONT, (_m, subj: string) => `${subj} doesn’t`)),
    };
  }
  const agreement = AGREEMENT.exec(transcript);
  if (agreement) {
    const [, subject = '', verb = ''] = agreement;
    const original = sentenceContaining(transcript, agreement.index);
    const corrected = original.replace(AGREEMENT, `${subject} ${THIRD_PERSON[verb.toLowerCase()] ?? verb}`);
    return { wrong: verb, better: capitalise(corrected) };
  }
  return null;
}

export function evaluateReply(turn: MockTurn, transcript: string, possessive: 'her' | 'his'): Feedback {
  const clean = transcript.trim();
  if (clean.split(/\s+/).filter(Boolean).length < MIN_WORDS) {
    return { heard: false, positives: [], fix: null, tip: null, category: null };
  }

  const known = turn.knownFixes?.find((k) => k.pattern.test(clean));
  const fix: GrammarFix | null = known ? { wrong: known.wrong, better: known.better } : genericFix(clean);

  if (fix) {
    const future = /\bwill\b/i.test(fix.better) && !/\bwill\b/i.test(clean);
    const agreement = !known && (DONT.test(clean) || AGREEMENT.test(clean));
    const [tip, category] = future
      ? ['Use “will” for promises about later: “I will call you.”', 'tense']
      : agreement
        ? ['With he, she or it, add -s: “She likes”, “He has”.', 'agreement']
        : ['Keep your sentence, change only the word that is wrong.', 'grammar'];
    return { heard: true, positives: [`You answered ${possessive} question clearly`], fix, tip, category };
  }
  return { heard: true, positives: ['You sounded warm and kind', 'No grammar mistakes. Well said!'], fix: null, tip: null, category: null };
}
