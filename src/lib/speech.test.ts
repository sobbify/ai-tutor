import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const voice = vi.hoisted(() => ({
  available: true,
  load: vi.fn<(text: string) => Promise<unknown>>(),
  play: vi.fn<(buffer: unknown, onEnded: () => void) => () => void>(),
}));
vi.mock('./audio/voice', () => ({
  geminiVoiceAvailable: () => voice.available,
  loadVoice: voice.load,
  playBuffer: voice.play,
}));

const synth = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [] };

beforeEach(() => {
  vi.resetModules();
  voice.available = true;
  voice.load.mockReset();
  voice.play.mockReset();
  synth.speak.mockReset();
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      onend: (() => void) | null = null;
      constructor(readonly text: string) {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('useSpeech', () => {
  it('plays lines in Gemini’s voice and clears the speaking state when done', async () => {
    const { useSpeech } = await import('./speech');
    let ended: () => void = () => undefined;
    voice.load.mockResolvedValue('buffer');
    voice.play.mockImplementation((_b, onEnded) => {
      ended = onEnded;
      return vi.fn();
    });
    useSpeech.getState().speak('Will she be okay?', 'parent:mg-1');
    expect(useSpeech.getState().speakingId).toBe('parent:mg-1');
    await flush();
    expect(voice.load).toHaveBeenCalledWith('Will she be okay?', undefined);
    expect(voice.play).toHaveBeenCalledWith('buffer', expect.any(Function));
    expect(synth.speak).not.toHaveBeenCalled();
    ended();
    expect(useSpeech.getState().speakingId).toBeNull();
  });

  it('falls back to the browser voice when Gemini’s voice can’t be loaded', async () => {
    const { useSpeech } = await import('./speech');
    voice.load.mockRejectedValue(new Error('503'));
    useSpeech.getState().speak('Will she be okay?');
    await flush();
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('drops a line that arrives after a newer one was requested', async () => {
    const { useSpeech } = await import('./speech');
    let first: (v: unknown) => void = () => undefined;
    voice.load.mockReturnValueOnce(new Promise((r) => (first = r))).mockResolvedValueOnce('second');
    voice.play.mockReturnValue(vi.fn());
    useSpeech.getState().speak('one', 'a');
    useSpeech.getState().speak('two', 'b');
    first('first');
    await flush();
    expect(voice.play).toHaveBeenCalledTimes(1);
    expect(voice.play).toHaveBeenCalledWith('second', expect.any(Function));
    expect(useSpeech.getState().speakingId).toBe('b');
  });
});
