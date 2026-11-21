import { describe, expect, it } from 'vitest';
import { MOMENTS } from './content';
import { evaluateReply } from './evaluator';

const [morning] = MOMENTS;
const turn = morning!.turns[0]!;

describe('evaluateReply (mock grammar check)', () => {
  it('flags the scripted mistake with its correction', () => {
    const fb = evaluateReply(turn, 'Good morning. Don’t worry, she settle quickly.', 'her');
    expect(fb).toEqual({
      heard: true,
      positives: ['You answered her question clearly'],
      fix: { wrong: 'settle', better: 'She will settle in quickly.' },
      tip: 'Use “will” for promises about later: “I will call you.”',
    });
  });

  it('catches subject–verb agreement generically', () => {
    const fb = evaluateReply(turn, 'Yes. He like the songs very much.', 'his');
    expect(fb.fix).toEqual({ wrong: 'like', better: 'He likes the songs very much.' });
  });

  it("catches \"she don't\"", () => {
    const fb = evaluateReply(turn, 'She don’t cry any more.', 'her');
    expect(fb.fix?.better).toBe('She doesn’t cry any more.');
  });

  it('praises a clean reply', () => {
    const fb = evaluateReply(turn, 'Good morning! Don’t worry, she will settle in quickly.', 'her');
    expect(fb.fix).toBeNull();
    expect(fb.positives).toContain('No grammar mistakes. Well said!');
  });

  it('treats near-silence as not heard', () => {
    expect(evaluateReply(turn, ' um ', 'her')).toEqual({ heard: false, positives: [], fix: null, tip: null });
  });
});
