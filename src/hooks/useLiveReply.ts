import { useCallback, useEffect, useRef, useState } from 'react';
import { apiMode } from '@/api/client';
import { notifySessionLost } from '@/api/session';
import { ApiError } from '@/api/types';
import { IDLE_LEVELS, barLevels, getAudioContext, loadRecorderWorklet, webAudioSupported } from '@/lib/audio/context';
import type { z } from 'zod';
import { ReplySchema, StorySchema, type MomentId, type Reply, type Story } from '@/types/tutor';
import type { RecorderStatus } from './useRecorder';

/**
 * Realtime reply capture, as in the Live tutor: the microphone is downsampled to PCM16 16 kHz by an
 * AudioWorklet and streamed over a WebSocket *while the teacher speaks*. The backend relays it to
 * Gemini Live, so when they tap Stop the feedback is back in about a second — nothing to upload.
 *
 * Protocol: backend/src/ai_tutor/api/practice_ws.py. The socket carries the HttpOnly session cookie
 * (same origin), never the uid.
 */

export type StartResult = { ok: true } | { ok: false; reason: 'denied' | 'transport' | 'error'; error?: ApiError };

const CONNECT_TIMEOUT_MS = 8_000;
const RESULT_TIMEOUT_MS = 30_000;
const SERVER_CODES: Record<string, ApiError['code']> = {
  conflict: 'conflict',
  not_found: 'not_found',
  forbidden: 'forbidden',
  rate_limited: 'rate_limited',
  unavailable: 'unavailable',
};

export function liveReplySupported(): boolean {
  return (
    apiMode === 'http' &&
    webAudioSupported &&
    typeof AudioWorkletNode === 'function' &&
    typeof WebSocket === 'function' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function socketUrl(path: string): string {
  const base = import.meta.env.VITE_API_BASE_URL ? new URL(import.meta.env.VITE_API_BASE_URL) : window.location;
  const scheme = base.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${base.host}${path}`;
}

interface ServerMessage {
  type: 'ready' | 'live' | 'caption' | 'reply' | 'story' | 'error';
  text?: string;
  reply?: unknown;
  story?: unknown;
  code?: string;
  message?: string;
}

interface CaptureOptions {
  maxDurationMs?: number;
  onMaxDuration?: () => void;
}

/** A reply to the current line over /ws/practice/{moment}. */
export function useLiveReply(momentId: MomentId, options: CaptureOptions = {}) {
  const capture = useLiveCapture<Reply>(`/ws/practice/${encodeURIComponent(momentId)}`, 'reply', ReplySchema, options);
  return { ...capture, start: (turnId: string) => capture.start({ turnId }) };
}

/** "Tell me what happened" over /ws/story (up to two minutes). */
export function useLiveStory(options: CaptureOptions = {}) {
  const capture = useLiveCapture<Story>('/ws/story', 'story', StorySchema, { maxDurationMs: 120_000, ...options });
  return { ...capture, start: () => capture.start({}) };
}

const serverError = (m: ServerMessage) =>
  new ApiError(m.message || 'Couldn’t check that reply. Please try again.', 0, SERVER_CODES[m.code ?? ''] ?? 'server');

function useLiveCapture<T>(
  path: string,
  resultKey: 'reply' | 'story',
  schema: z.ZodType<T>,
  { maxDurationMs = 60_000, onMaxDuration }: CaptureOptions = {},
) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [levels, setLevels] = useState<number[]>(IDLE_LEVELS);
  const [caption, setCaption] = useState('');

  const socket = useRef<WebSocket | null>(null);
  const media = useRef<MediaStream | null>(null);
  const nodes = useRef<AudioNode[]>([]);
  const recorder = useRef<AudioWorkletNode | null>(null);
  const frame = useRef<number | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ resolve: (r: T) => void; reject: (e: ApiError) => void } | null>(null);
  const onMax = useRef(onMaxDuration);
  useEffect(() => {
    onMax.current = onMaxDuration;
  }, [onMaxDuration]);

  /** Stop the microphone and the audio graph (the socket may stay open for the result). */
  const releaseMic = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (maxTimer.current) clearTimeout(maxTimer.current);
    maxTimer.current = null;
    if (recorder.current) recorder.current.port.onmessage = null;
    recorder.current = null;
    for (const node of nodes.current) node.disconnect();
    nodes.current = [];
    media.current?.getTracks().forEach((track) => track.stop());
    media.current = null;
    setLevels(IDLE_LEVELS);
  }, []);

  const closeSocket = useCallback((cancel: boolean) => {
    const ws = socket.current;
    socket.current = null;
    if (!ws) return;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    if (cancel && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'cancel' }));
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000);
  }, []);

  const start = useCallback(
    async (startFields: Record<string, string>): Promise<StartResult> => {
      setStatus('requesting');
      setCaption('');
      const context = getAudioContext(); // inside the tap, so the browser lets it start
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        });
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        const denied = name === 'NotAllowedError' || name === 'SecurityError';
        setStatus(denied ? 'denied' : 'error');
        return { ok: false, reason: denied ? 'denied' : 'transport' };
      }
      media.current = stream;

      const ws = new WebSocket(socketUrl(path));
      ws.binaryType = 'arraybuffer';
      socket.current = ws;
      const ready = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new ApiError('timeout', 0, 'network')), CONNECT_TIMEOUT_MS);
        ws.onopen = () => ws.send(JSON.stringify({ type: 'start', ...startFields }));
        ws.onerror = () => reject(new ApiError('socket', 0, 'network'));
        ws.onclose = (e) => {
          if (e.code === 1008) notifySessionLost();
          reject(new ApiError('closed', 0, e.code === 1008 ? 'forbidden' : 'network'));
        };
        ws.onmessage = (e: MessageEvent<string>) => {
          const m = JSON.parse(e.data) as ServerMessage;
          clearTimeout(timer);
          if (m.type === 'ready') resolve();
          else if (m.type === 'error') reject(serverError(m));
        };
      });

      try {
        await Promise.all([ready, loadRecorderWorklet(context)]);
      } catch (err) {
        releaseMic();
        closeSocket(false);
        setStatus('idle');
        const error = err instanceof ApiError ? err : new ApiError('worklet', 0, 'network');
        return error.code === 'network' ? { ok: false, reason: 'transport' } : { ok: false, reason: 'error', error };
      }

      ws.onmessage = (e: MessageEvent<string>) => {
        const m = JSON.parse(e.data) as ServerMessage;
        if (m.type === 'caption' && m.text) setCaption(m.text);
        if (m.type === resultKey) {
          const parsed = schema.safeParse(m[resultKey]);
          if (parsed.success) pending.current?.resolve(parsed.data);
          else pending.current?.reject(new ApiError('The tutor service sent an unexpected response.', 0, 'invalid_response'));
          pending.current = null;
        }
        if (m.type === 'error') {
          pending.current?.reject(serverError(m));
          pending.current = null;
        }
      };
      ws.onclose = () => {
        pending.current?.reject(new ApiError('The connection dropped. Please try again.', 0, 'network'));
        pending.current = null;
      };

      // Mic → analyser (bars) and → worklet (PCM16 16 kHz) → socket. The worklet feeds a muted gain
      // so it keeps running without echoing the mic to the speakers.
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      const node = new AudioWorkletNode(context, 'pcm-recorder');
      const mute = context.createGain();
      mute.gain.value = 0;
      node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(e.data);
      };
      source.connect(analyser);
      source.connect(node);
      node.connect(mute).connect(context.destination);
      recorder.current = node;
      nodes.current = [source, analyser, node, mute];

      const data = new Uint8Array(analyser.frequencyBinCount);
      let last = 0;
      const tick = (now: number) => {
        if (now - last > 66) {
          last = now;
          setLevels(barLevels(analyser, data));
        }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
      maxTimer.current = setTimeout(() => onMax.current?.(), maxDurationMs);
      setStatus('recording');
      return { ok: true };
    },
    [closeSocket, maxDurationMs, path, releaseMic, resultKey, schema],
  );

  /** Stop speaking: flush the last audio, ask for the result, resolve with the checked reply. */
  const finish = useCallback(async (): Promise<T> => {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      releaseMic();
      setStatus('idle');
      throw new ApiError('The connection dropped. Please try again.', 0, 'network');
    }
    setStatus('stopping');
    recorder.current?.port.postMessage('flush');
    await new Promise((resolve) => setTimeout(resolve, 60)); // let the last chunk arrive
    releaseMic();
    const result = new Promise<T>((resolve, reject) => {
      pending.current = { resolve, reject };
    });
    ws.send(JSON.stringify({ type: 'stop' }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ApiError('Couldn’t check that reply. Please try again.', 0, 'unavailable')), RESULT_TIMEOUT_MS);
    });
    try {
      return await Promise.race([result, timeout]);
    } finally {
      clearTimeout(timer);
      pending.current = null;
      closeSocket(false);
      setStatus('idle');
    }
  }, [closeSocket, releaseMic]);

  /** Discard the current reply ("Start Over"); nothing is stored. */
  const cancel = useCallback(() => {
    pending.current = null;
    releaseMic();
    closeSocket(true);
    setCaption('');
    setStatus('idle');
  }, [closeSocket, releaseMic]);

  useEffect(
    () => () => {
      pending.current = null;
      releaseMic();
      closeSocket(true);
    },
    [closeSocket, releaseMic],
  );

  return { status, levels, caption, start, finish, cancel };
}
