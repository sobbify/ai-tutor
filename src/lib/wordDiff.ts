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
      push(right, bj, true);
      j++;
    } else {
      push(left, ai, true);
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
