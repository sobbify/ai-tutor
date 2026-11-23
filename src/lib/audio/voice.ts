import { apiMode } from '@/api/client';
import { fetchVoice } from '@/api/httpApi';
import { ApiError } from '@/api/types';
import { getAudioContext, webAudioSupported } from './context';

/**
 * Gemini's voice for the lines the app shows (parent lines, model replies, grammar fixes).
 * The backend synthesises and caches each line once; here the WAV bytes are prefetched and kept in
 * a small in-memory cache so "Hear Again" and the speaker buttons start instantly.
 */

const MAX_CACHED = 48;
const bytes = new Map<string, Promise<ArrayBuffer>>();
const decoded = new Map<string, AudioBuffer>();
let disabledUntil = 0;

export function geminiVoiceAvailable(): boolean {
  return apiMode === 'http' && webAudioSupported && Date.now() >= disabledUntil;
}

function remember<V>(map: Map<string, V>, key: string, value: V) {
  map.delete(key);
  map.set(key, value);
  if (map.size > MAX_CACHED) map.delete(map.keys().next().value as string);
}

function load(text: string): Promise<ArrayBuffer> {
  const hit = bytes.get(text);
  if (hit) return hit;
  const p = fetchVoice(text).catch((err: unknown) => {
    bytes.delete(text);
    // Switched off on the server (204): the browser's voice for this visit. Gemini unavailable
    // (503): the browser's voice for a minute, then try again.
    if (err instanceof ApiError && err.status === 204) disabledUntil = Number.POSITIVE_INFINITY;
    if (err instanceof ApiError && err.status === 503) disabledUntil = Date.now() + 60_000;
    throw err;
  });
  remember(bytes, text, p);
  return p;
}

/** Start downloading a line's audio ahead of time (no AudioContext needed). */
export function prefetchVoice(text: string | null | undefined): void {
  if (text && geminiVoiceAvailable()) load(text).catch(() => undefined);
}

async function loadUrl(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (response.status !== 200) throw new Error(`voice ${response.status}`);
  return response.arrayBuffer();
}

export async function loadVoice(text: string, url?: string): Promise<AudioBuffer> {
  const ready = decoded.get(text);
  if (ready) return ready;
  if (!webAudioSupported) throw new Error('no Web Audio');
  const data = url ? await loadUrl(url) : await load(text);
  // decodeAudioData detaches its input: hand it a copy so the cached bytes stay usable.
  const buffer = await getAudioContext().decodeAudioData(data.slice(0));
  remember(decoded, text, buffer);
  return buffer;
}

/** The line's encoded audio (a fresh copy), for players that decode it themselves (the 3D avatar). */
export async function loadVoiceBytes(text: string): Promise<ArrayBuffer> {
  return (await load(text)).slice(0);
}

/** Play a decoded line; returns a function that stops it. `onEnded` fires once either way. */
export function playBuffer(buffer: AudioBuffer, onEnded: () => void): () => void {
  const context = getAudioContext();
  const node = context.createBufferSource();
  node.buffer = buffer;
  node.connect(context.destination);
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    onEnded();
  };
  node.onended = finish;
  node.start(context.currentTime + 0.02);
  return () => {
    node.onended = null;
    try {
      node.stop();
    } catch {
      /* already stopped */
    }
    node.disconnect();
    ended = true;
  };
}
