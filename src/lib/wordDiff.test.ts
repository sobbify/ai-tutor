import { describe, expect, it } from 'vitest';
import { changeAnchor, closestSentence, closestSpan, condenseDiff, diffWords } from './wordDiff';

const changed = (parts: { text: string; changed: boolean }[]) => parts.filter((p) => p.changed).map((p) => p.text.trim());

describe('diffWords', () => {
  it('marks only the words that changed', () => {
    const d = diffWords('Yes, he eat all his lunch today.', 'Yes, he ate all his lunch today.');
    expect(changed(d.said)).toEqual(['eat']);
    expect(changed(d.better)).toEqual(['ate']);
  });

  it('marks added words and keeps punctuation-only differences quiet', () => {
    const d = diffWords('Good morning. Don’t worry, she settle quickly', 'Good morning. Don’t worry, she will settle quickly.');
    expect(changed(d.better)).toEqual(['will']);
    expect(changed(d.said)).toEqual([]);
  });

  it('finds the sentence a fix is about', () => {
    expect(closestSentence('She is settling well. She have many friends now.', 'She has many friends now.')).toBe('She have many friends now.');
  });

  it('trims a long sentence to the words a short fix is about', () => {
    expect(closestSpan('A parent asked me about lunch and I said he eat well today.', 'He eats well.')).toBe('… he eat well …');
    expect(closestSpan('She settle quickly.', 'She will settle in quickly.')).toBe('She settle quickly.');
    // A clause that has nothing to do with the fix isn't struck out as if it were wrong.
    expect(closestSpan('Don’t worry, she settle quickly.', 'She will settle in quickly.')).toBe('… she settle quickly.');
    // …and the "…" itself isn't marked as a removed word.
    expect(diffWords('… she settle quickly.', 'She will settle in quickly.').said).toEqual([{ text: '… she settle quickly.', changed: false }]);
    expect(closestSpan('She settle quickly, don’t worry.', 'She will settle in quickly.')).toBe('She settle quickly …');
    // A word the fix removes inside the same clause is still shown.
    expect(closestSpan('The Ria is happy today.', 'Ria is happy today.')).toBe('The Ria is happy today.');
    expect(closestSpan('Yes ma’am, she use full sentences now.', 'Yes, she uses full sentences now.')).toBe('Yes ma’am, she use full sentences now.');
  });

  it('condenses a long sentence to a few words around its one change', () => {
    const said = 'A mother asked me in morning about lunch and I said he eat well and she play nicely.';
    const better = 'A mother asked me in morning about lunch and I said he eats well and she play nicely.';
    const diff = diffWords(said, better);
    const text = (parts: { text: string }[]) => parts.map((p) => p.text).join('');
    expect(text(condenseDiff(diff.said))).toBe('… I said he eat well and she …');
    expect(text(condenseDiff(diff.better))).toBe('… I said he eats well and she …');
    expect(condenseDiff(diff.better).filter((p) => p.changed).map((p) => p.text.trim())).toEqual(['eats']);
    // A fix that only adds a word: her side is cut around where it goes.
    const added = diffWords('A mother asked me in morning about lunch and I said he eats well.', 'A mother asked me in the morning about lunch and I said he eats well.');
    expect(text(condenseDiff(added.said, 3, 12, changeAnchor(added.better)))).toBe('… asked me in morning about lunch …');
    expect(text(condenseDiff(added.better))).toBe('… asked me in the morning about lunch …');
    // Short sentences stay whole.
    const short = diffWords('She settle quickly.', 'She will settle in quickly.');
    expect(condenseDiff(short.better)).toEqual(short.better);
  });
});
