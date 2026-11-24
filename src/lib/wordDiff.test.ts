import { describe, expect, it } from 'vitest';
import { closestSentence, closestSpan, diffWords } from './wordDiff';

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
});
