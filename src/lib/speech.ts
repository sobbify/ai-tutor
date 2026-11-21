import { create } from 'zustand';
import { geminiVoiceAvailable, loadVoice, playBuffer } from './audio/voice';

/**
 * "Hear Again", the automatic parent line and the speaker buttons. Lines are spoken in Gemini's
 * native voice (the same voices as the Live tutor, synthesised and cached by the backend); the
 * browser's own speech synthesis is the fallback (demo build, no keys, Gemini unavailable).
 * One line plays at a time across the app; `speakingId` tells each button whether it is playing.
 * When the avatar provider is wired in, parent lines will play its video audio instead.
 */

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
      loadVoice(text, url)
        .then((buffer) => {
          if (token === playing) stopAudio = playBuffer(buffer, () => done(token));
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
