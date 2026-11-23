import { describe, expect, it } from 'vitest';
import { closestSentence, diffWords } from './wordDiff';

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
});
