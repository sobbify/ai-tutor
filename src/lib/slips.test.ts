import { describe, expect, it } from 'vitest';
import { groupSlips, slipsOf } from './slips';

describe('slips', () => {
  it('lists the main fix first, then the others, and groups them by category', () => {
    const slips = slipsOf({
      fix: { wrong: 'settle', better: 'She will settle.' },
      tip: 'Use will.',
      category: 'tense',
      moreFixes: [
        { wrong: 'have', better: 'She has a toy.', category: 'agreement' },
        { wrong: 'go', better: 'She went home.', tip: null, category: 'tense' },
        { wrong: 'friend', better: 'Many friends.' },
      ],
    });
    expect(slips.map((s) => s.category)).toEqual(['tense', 'agreement', 'tense', 'grammar']);
    expect(groupSlips(slips).map((g) => [g.category, g.slips.map((s) => s.wrong)])).toEqual([
      ['tense', ['settle', 'go']],
      ['agreement', ['have']],
      ['grammar', ['friend']],
    ]);
    expect(slipsOf({ fix: null, moreFixes: [{ wrong: 'a', better: 'b' }] })).toEqual([]);
  });
});
