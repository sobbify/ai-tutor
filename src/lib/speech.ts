import { create } from 'zustand';
import { geminiVoiceAvailable, loadVoice, loadVoiceBytes, playBuffer } from './audio/voice';

/**
 * "Hear Again", the automatic parent line and the speaker buttons. Lines are spoken in Gemini's
 * native voice (the same voices as the Live tutor, synthesised and cached by the backend); the
 * browser's own speech synthesis is the fallback (demo build, no keys, Gemini unavailable).
 * One line plays at a time across the app; `speakingId` tells each button whether it is playing.
 * While a talking 3D avatar is on screen, the parent's lines (`parent:` ids) play through it, so
 * its mouth moves with the words.
 */

/** Something on screen that plays a parent line itself and lip-syncs to it (the 3D avatar). */
export interface StageSpeaker {
  speak: (audio: ArrayBuffer) => Promise<void>;
  stop: () => void;
}

let stage: StageSpeaker | null = null;
let pending: { done: Promise<void>; release: () => void } | null = null;
const STAGE_WAIT_MS = 3000;

/** Register the avatar that should voice parent lines; returns a function that unregisters it. */
export function setStageSpeaker(speaker: StageSpeaker): () => void {
  stage = speaker;
  pending?.release();
  return () => {
    if (stage === speaker) stage = null;
  };
}

/**
 * An avatar is loading: parent lines wait for it (up to 3 s) so even the first line is lip-synced.
 * Returns a function to call when it is ready or has given up.
 */
export function expectStageSpeaker(): () => void {
  let release: () => void = () => undefined;
  const done = new Promise<void>((resolve) => {
    release = resolve;
  });
  const mine = { done, release };
  pending = mine;
  return () => {
    mine.release();
    if (pending === mine) pending = null;
  };
}

function stageWhenReady(): Promise<StageSpeaker | null> {
  if (stage || !pending) return Promise.resolve(stage);
  const wait = pending.done;
  return Promise.race([wait, new Promise((resolve) => setTimeout(resolve, STAGE_WAIT_MS))]).then(() => stage);
}

interface SpeechState {
  speakingId: string | null;
  /** `url`: a GET audio URL for this line (the phrasebook's, kept by the service worker offline). */
  speak: (text: string, id?: string, url?: string) => void;
  stop: () => void;
}

const browserSpeech = typeof window !== 'undefined' && 'speechSynthesis' in window;
export const speechSupported = browserSpeech || geminiVoiceAvailable();

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === 'en-IN') ??
    voices.find((v) => v.lang === 'en-GB') ??
    voices.find((v) => v.lang.startsWith('en'))
  );
}

let playing = 0; // increments per request so late audio from an older request is dropped
let stopAudio: (() => void) | null = null;

export const useSpeech = create<SpeechState>((set, get) => {
  const done = (token: number) => {
    if (token !== playing) return;
    stopAudio = null;
    set({ speakingId: null });
  };

  const speakWithBrowser = (text: string, token: number) => {
    if (!browserSpeech) return done(token);
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? 'en-IN';
    utterance.rate = 0.95;
    utterance.onend = () => done(token);
    utterance.onerror = () => done(token);
    window.speechSynthesis.speak(utterance);
  };

  return {
    speakingId: null,
    speak: (text, id = text, url) => {
      get().stop();
      const token = ++playing;
      set({ speakingId: id });
      if (!geminiVoiceAvailable() && !url) return speakWithBrowser(text, token);
      const playHere = () =>
        loadVoice(text, url)
          .then((buffer) => {
            if (token === playing) stopAudio = playBuffer(buffer, () => done(token));
          })
          .catch(() => {
            if (token === playing) speakWithBrowser(text, token);
          });
      if (url || !id.startsWith('parent:')) return void playHere();
      Promise.all([stageWhenReady(), loadVoiceBytes(text)])
        .then(([speaker, bytes]) => {
          if (token !== playing) return;
          if (!speaker) return void playHere();
          stopAudio = () => speaker.stop();
          speaker.speak(bytes).then(
            () => done(token),
            () => {
              if (token === playing) void playHere(); // the avatar couldn't play it: plain audio
            },
          );
        })
        .catch(() => {
          if (token === playing) speakWithBrowser(text, token);
        });
    },
    stop: () => {
      playing++;
      stopAudio?.();
      stopAudio = null;
      if (browserSpeech) window.speechSynthesis.cancel();
      set({ speakingId: null });
    },
  };
});
