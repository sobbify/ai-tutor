/**
 * What she improved: the words she now says right that she got wrong before (mirrors
 * backend/services/improve.py; the demo mock uses it). Only ever about her own earlier try.
 */
const WORD = /[\p{L}\p{N}’']+/gu;

const words = (text: string) => (text.match(WORD) ?? []).map((w) => w.toLowerCase().replace(/’/g, "'"));

/** Longest-common-subsequence alignment of two word lists, as edit operations. */
function ops(a: string[], b: string[]): Array<{ tag: 'equal' | 'insert' | 'delete' | 'replace'; i1: number; i2: number; j1: number; j2: number }> {
  // LCS lengths in a flat table: at(i, j) = longest common run of a[i:] and b[j:].
  const width = b.length + 1;
  const table = new Array<number>((a.length + 1) * width).fill(0);
  const at = (i: number, j: number) => table[i * width + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) table[i * width + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
  }
  const out: ReturnType<typeof ops> = [];
  let i = 0;
  let j = 0;
  let si = 0;
  let sj = 0;
  const flush = () => {
    if (si < i || sj < j) out.push({ tag: si < i && sj < j ? 'replace' : si < i ? 'delete' : 'insert', i1: si, i2: i, j1: sj, j2: j });
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush();
      out.push({ tag: 'equal', i1: i, i2: i + 1, j1: j, j2: j + 1 });
      i++;
      j++;
      si = i;
      sj = j;
    } else if (j < b.length && (i >= a.length || at(i, j + 1) >= at(i + 1, j))) j++;
    else i++;
  }
  flush();
  return out;
}

const similarity = (a: string[], b: string[]) => {
  const same = ops(a, b).filter((o) => o.tag === 'equal').length;
  return (2 * same) / Math.max(1, a.length + b.length);
};

function closest(text: string, target: string[]): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  return (sentences.length ? sentences : [text]).map(words).reduce((best, w) => (similarity(w, target) > similarity(best, target) ? w : best), [] as string[]);
}

const pairs = (w: string[]) => new Set(w.slice(1).map((x, i) => `${w[i]} ${x}`));

export function improvedWords(before: string, slips: Array<{ wrong: string; better: string }>, after: string): string[] {
  const said = words(after);
  if (!said.length) return [];
  const saidPairs = pairs(said);
  const found: string[] = [];
  for (const slip of slips) {
    const target = words(slip.better);
    const old = closest(before, target);
    const edits = ops(old, target);
    const added = edits.filter((o) => o.tag === 'insert' || o.tag === 'replace').flatMap((o) => target.slice(o.j1, o.j2));
    if (!added.length || !added.every((w) => said.includes(w))) continue;
    // The word pairs of hers that the fix splits or changes must be gone.
    const broken = edits
      .filter((o) => o.tag !== 'equal' && !(o.tag === 'delete' && (o.i1 === 0 || o.i2 === old.length)))
      .flatMap((o) => Array.from({ length: Math.max(0, Math.min(old.length - 1, o.i2) - Math.max(0, o.i1 - 1)) }, (_, k) => `${old[Math.max(0, o.i1 - 1) + k]} ${old[Math.max(0, o.i1 - 1) + k + 1]}`));
    if (broken.some((p) => saidPairs.has(p))) continue;
    // …and the fix's new words must sit where the fix puts them ("she has"), not just anywhere.
    const oldPairs = pairs(old);
    if (![...pairs(target)].some((p) => !oldPairs.has(p) && saidPairs.has(p))) continue;
    for (const w of added) if (!found.includes(w)) found.push(w);
  }
  const original = after.match(WORD) ?? [];
  return original.filter((w, i) => found.includes(said[i] ?? '') && !original.slice(0, i).includes(w));
}
