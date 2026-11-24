import type { TalkingAvatar } from "@interviewflowai/talking-avatar";
import { describe, expect, it, vi } from "vitest";
import { LIP_LEAD_MS, leadMouth, warmAudio } from "./lipSync";

describe("lip sync timing", () => {
  it("runs the mouth clock ahead of the audio clock", () => {
    const fake = {
      now: 1000,
      heardMs(this: { now: number }) {
        return this.now;
      },
    };
    leadMouth(fake as unknown as TalkingAvatar);
    expect(fake.heardMs()).toBe(1000 + LIP_LEAD_MS);
    fake.now = 2500;
    expect(fake.heardMs()).toBe(2500 + LIP_LEAD_MS);
  });

  it("leaves an avatar alone if the library internals change", () => {
    const fake = {};
    expect(() => leadMouth(fake as unknown as TalkingAvatar)).not.toThrow();
    expect(() => warmAudio(fake as unknown as TalkingAvatar)).not.toThrow();
  });

  it("warms the audio pipeline once the head is ready", () => {
    const audioContext = vi.fn(() => Promise.resolve({} as AudioContext));
    warmAudio({ audioContext } as unknown as TalkingAvatar);
    expect(audioContext).toHaveBeenCalledOnce();
  });
});
