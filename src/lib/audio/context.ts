/**
 * One shared AudioContext for Gemini's voice and the realtime microphone stream (as in the Live
 * tutor's AudioEngine). Browsers only let it start after a user gesture, so it is created lazily
 * from a tap (or after the page has been interacted with).
 */

let ctx: AudioContext | null = null;
let worklet: Promise<void> | null = null;

export const webAudioSupported = typeof window !== 'undefined' && typeof window.AudioContext === 'function';

export function getAudioContext(): AudioContext {
  if (!ctx || ctx.state === 'closed') {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    worklet = null;
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

/** Loads the PCM16/16 kHz recorder worklet once per context. */
export function loadRecorderWorklet(context: AudioContext): Promise<void> {
  worklet ??= context.audioWorklet.addModule(`${import.meta.env.BASE_URL}pcm-recorder-worklet.js`).catch((err: unknown) => {
    worklet = null;
    throw err;
  });
  return worklet;
}

const BAR_COUNT = 5;
export const IDLE_LEVELS = [0.35, 0.6, 0.8, 1, 0.5];

/** Five "Listening…" bars (0.25–1) from an analyser's spectrum. */
export function barLevels(analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>): number[] {
  analyser.getByteFrequencyData(data);
  const band = Math.floor(data.length / BAR_COUNT);
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    let sum = 0;
    for (let j = i * band; j < (i + 1) * band; j++) sum += data[j] ?? 0;
    return Math.max(0.25, Math.min(1, sum / band / 160));
  });
}
