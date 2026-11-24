import { describe, expect, it } from 'vitest';
import { improvedWords } from './improve';

describe('improvedWords (same rules as the backend)', () => {
  const before = 'Don’t worry, she settle quickly. She have many friends.';
  const slips = [
    { wrong: 'settle', better: 'She will settle in quickly.' },
    { wrong: 'have', better: 'She has many friends.' },
  ];
  it('finds the words she fixed', () => {
    expect(improvedWords(before, slips, 'Don’t worry, she will settle in quickly. She has many friends.')).toEqual(['will', 'in', 'has']);
    expect(improvedWords(before, slips, 'Don’t worry, she settle quickly. She has many friends.')).toEqual(['has']);
  });
  it('finds nothing when nothing changed', () => {
    expect(improvedWords(before, slips, before)).toEqual([]);
    expect(improvedWords(before, slips, 'Good morning ma’am.')).toEqual([]);
    expect(improvedWords(before, [], 'She has many friends.')).toEqual([]);
    expect(improvedWords('I will check and we practise sharing tomorrow.', [{ wrong: 'we practise', better: 'We will practise sharing tomorrow.' }], 'Thank you ma’am, I will check today itself.')).toEqual([]);
  });
});
