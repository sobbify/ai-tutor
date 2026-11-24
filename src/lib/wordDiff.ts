/**
 * Word-level diff between what she said and the corrected sentence, so the correction card can
 * mark exactly which words changed: removed words in her sentence, added ones in the fix.
 */
export interface DiffPart {
  text: string;
  changed: boolean;
}

const norm = (w: string) => w.toLowerCase().replace(/[’`]/g, "'").replace(/[^\p{L}\p{N}']/gu, '');

function tokens(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

/** Longest common subsequence table over normalised words. */
function lcs(a: string[], b: string[]): number[][] {
  const t = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const ti = t[i] as number[];
      const next = t[i + 1] as number[];
      ti[j] = norm(a[i] ?? '') === norm(b[j] ?? '') && norm(a[i] ?? '') !== '' ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, ti[j + 1] ?? 0);
    }
  }
  return t;
}

/** Both sides of the diff, each as runs of unchanged / changed words (whitespace kept). */
export function diffWords(said: string, better: string): { said: DiffPart[]; better: DiffPart[] } {
  const a = tokens(said);
  const b = tokens(better);
  const t = lcs(a, b);
  const left: DiffPart[] = [];
  const right: DiffPart[] = [];
  const push = (list: DiffPart[], text: string, changed: boolean) => {
    const last = list[list.length - 1];
    if (last && last.changed === changed) last.text += text;
    else list.push({ text, changed });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const ai = a[i] ?? '';
    const bj = b[j] ?? '';
    if (i < a.length && j < b.length && norm(ai) === norm(bj) && norm(ai) !== '') {
      push(left, ai, false);
      push(right, bj, false);
      i++;
      j++;
    } else if (j < b.length && (i >= a.length || (t[i]?.[j + 1] ?? 0) >= (t[i + 1]?.[j] ?? 0))) {
      push(right, bj, norm(bj) !== ''); // a lone "…" or dash is never a change
      j++;
    } else {
      push(left, ai, norm(ai) !== '');
      i++;
    }
  }
  return { said: left, better: right };
}

/** The sentence in her reply that the fix is about (her reply may hold several sentences). */
export function closestSentence(transcript: string, better: string): string {
  const parts = transcript.match(/[^.!?]+[.!?]*\s*/g)?.map((p) => p.trim()).filter(Boolean) ?? [transcript];
  if (parts.length <= 1) return transcript.trim();
  const target = new Set(tokens(better).map(norm));
  let best = parts[0] ?? transcript;
  let score = -1;
  for (const p of parts) {
    const words = tokens(p).map(norm);
    const hits = words.filter((w) => target.has(w)).length / Math.max(1, words.length);
    if (hits > score) {
      score = hits;
      best = p;
    }
  }
  return best;
}

/**
 * When the fix is much shorter than her sentence ("He eats well." for a long story sentence), the
 * stretch of her words it corrects, with "…" where words were left out on either side.
 */
export function closestSpan(sentence: string, better: string): string {
  const trimmed = dropUnrelatedClauses(sentence, better);
  if (trimmed !== sentence.trim()) return trimmed;
  const words = tokens(sentence);
  const target = tokens(better);
  if (words.length <= target.length + 3) return sentence.trim();
  let best = { start: 0, end: words.length, score: -1 };
  for (let size = Math.max(1, target.length - 2); size <= Math.min(words.length, target.length + 3); size++) {
    for (let start = 0; start + size <= words.length; start++) {
      const window = words.slice(start, start + size);
      const common = lcs(window, target)[0]?.[0] ?? 0;
      const score = common - size * 0.01; // prefer the tighter window on a tie
      if (score > best.score) best = { start, end: start + size, score };
    }
  }
  const text = words.slice(best.start, best.end).join('').trim();
  return `${best.start > 0 ? '… ' : ''}${text}${best.end < words.length ? ' …' : ''}`;
}

/**
 * Leading or trailing clauses (split at , ; :) that share no word with the fix aren't part of
 * the slip: "Don't worry, she settle quickly." → "… she settle quickly." for "She will settle in
 * quickly." Without this the diff would strike "Don't worry," as if she shouldn't have said it.
 * A word the fix removes inside the same clause ("The Ria is happy") is still shown.
 */
function dropUnrelatedClauses(sentence: string, better: string): string {
  const clauses = sentence.trim().match(/[^,;:]+[,;:]?\s*/g) ?? [];
  if (clauses.length < 2) return sentence.trim();
  const target = new Set(tokens(better).map(norm).filter(Boolean));
  const related = (c: string) => tokens(c).some((w) => target.has(norm(w)));
  let start = 0;
  let end = clauses.length;
  while (start < end - 1 && !related(clauses[start] ?? '')) start++;
  while (end - 1 > start && !related(clauses[end - 1] ?? '')) end--;
  if (start === 0 && end === clauses.length) return sentence.trim();
  const text = clauses.slice(start, end).join('').trim().replace(/[,;:]$/, '');
  return `${start > 0 ? '… ' : ''}${text}${end < clauses.length ? ' …' : ''}`;
}

/**
 * In a long sentence with one small change, keep only a few words either side of it ("… said he
 * eat well …"), so a list of several fixes stays short. Short sentences come back unchanged.
 */
export function condenseDiff(parts: DiffPart[], context = 3, minWords = 12, anchor?: number): DiffPart[] {
  const words = parts.flatMap((p) => (p.text.match(/\S+\s*/g) ?? []).map((text) => ({ text, changed: p.changed })));
  if (words.length < minWords) return parts;
  // Nothing changed on this side (a word is only added): centre on where it goes, if known.
  const found = words.findIndex((w) => w.changed);
  const first = found >= 0 ? found : (anchor ?? -1);
  if (first < 0) return parts;
  // An added word sits between two of hers, so the context after it starts one word earlier.
  const last = found >= 0 ? words.length - 1 - [...words].reverse().findIndex((w) => w.changed) : first - 1;
  const start = Math.max(0, first - context);
  const end = Math.min(words.length, last + context + 1);
  if (start === 0 && end === words.length) return parts;
  const out: DiffPart[] = [];
  const push = (text: string, changed: boolean) => {
    const prev = out[out.length - 1];
    if (prev && prev.changed === changed) prev.text += text;
    else out.push({ text, changed });
  };
  if (start > 0) push('… ', false);
  for (const w of words.slice(start, end)) push(w.text, w.changed);
  if (end < words.length) push(`${out.length && /\s$/.test(out[out.length - 1]?.text ?? '') ? '' : ' '}…`, false);
  return out;
}

/** Where her sentence's words meet the first change in the fix: the number of unchanged words
 * before it (so an added word can still be shown in context on her side). */
export function changeAnchor(better: DiffPart[]): number | undefined {
  let words = 0;
  for (const part of better) {
    if (part.changed) return words;
    words += (part.text.match(/\S+/g) ?? []).length;
  }
  return undefined;
}

