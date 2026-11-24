import type { TalkingAvatar } from "@interviewflowai/talking-avatar";

/**
 * How far the mouth runs ahead of the voice. The library times each mouth shape to the audio clock, but
 * every shape is eased in over ~160 ms and the frame reaches the screen a frame or two after the sound,
 * so on phones the lips trail the voice. Running the mouth's clock a little early puts them back on the
 * syllable; people barely notice lips that lead slightly, but do notice lips that lag.
 */
export const LIP_LEAD_MS = 80;

/** Library internals we nudge (pinned to @interviewflowai/talking-avatar 0.3.0); skipped if they change. */
interface Internals {
  heardMs?: () => number;
  audioContext?: () => Promise<AudioContext>;
}

/** Run the mouth LIP_LEAD_MS ahead of the audio that's coming out of the speaker. */
export function leadMouth(instance: TalkingAvatar, leadMs = LIP_LEAD_MS): void {
  const inner = instance as unknown as Internals;
  const heard = inner.heardMs;
  if (typeof heard !== "function") return;
  inner.heardMs = () => heard.call(instance) + leadMs;
}

/** Set up the audio pipeline (context + worklet) now, so the first line doesn't wait for it. */
export function warmAudio(instance: TalkingAvatar): void {
  const inner = instance as unknown as Internals;
  if (typeof inner.audioContext !== "function") return;
  inner.audioContext.call(instance).catch(() => {
    // It will try again on the first line.
  });
}
