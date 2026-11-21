import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'stopping' | 'denied' | 'unsupported' | 'error';

export interface RecordingResult {
  audio: Blob | null;
  /** Browser transcript when the Web Speech API is available, else null. */
  transcript: string | null;
}

// Minimal typings for the (still prefixed) Web Speech recognition API.
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

const BAR_COUNT = 5;
const IDLE_LEVELS = [0.35, 0.6, 0.8, 1, 0.5];
const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function recordingSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';
}

/**
 * Microphone capture: MediaRecorder for the audio sent to the backend, an AnalyserNode for the
 * live "Listening…" bars, and (where available) browser speech-to-text as a transcript hint.
 * Everything is released on stop, cancel and unmount.
 */
export function useRecorder({ maxDurationMs = 60_000, onMaxDuration }: { maxDurationMs?: number; onMaxDuration?: () => void } = {}) {
  const [status, setStatus] = useState<RecorderStatus>(() => (recordingSupported() ? 'idle' : 'unsupported'));
  const [levels, setLevels] = useState<number[]>(IDLE_LEVELS);

  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioCtx = useRef<AudioContext | null>(null);
  const frame = useRef<number | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const transcript = useRef<string[]>([]);
  const recognitionEnded = useRef<Promise<void>>(Promise.resolve());
  const onMax = useRef(onMaxDuration);
  useEffect(() => {
    onMax.current = onMaxDuration;
  }, [onMaxDuration]);

  const release = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (maxTimer.current) clearTimeout(maxTimer.current);
    maxTimer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
    setLevels(IDLE_LEVELS);
  }, []);

  const startMeter = useCallback((media: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      ctx.createMediaStreamSource(media).connect(analyser);
      audioCtx.current = ctx;
      const data = new Uint8Array(analyser.frequencyBinCount);
      let last = 0;
      const tick = (now: number) => {
        if (now - last > 66) {
          last = now;
          analyser.getByteFrequencyData(data);
          const band = Math.floor(data.length / BAR_COUNT);
          setLevels(
            Array.from({ length: BAR_COUNT }, (_, i) => {
              let sum = 0;
              for (let j = i * band; j < (i + 1) * band; j++) sum += data[j] ?? 0;
              return Math.max(0.25, Math.min(1, sum / band / 160));
            }),
          );
        }
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    } catch {
      /* the meter is decorative; recording still works without it */
    }
  }, []);

  const startRecognition = useCallback(() => {
    const Ctor = recognitionCtor();
    transcript.current = [];
    if (!Ctor) return;
    try {
      const rec = new Ctor();
      rec.lang = 'en-IN';
      rec.continuous = true;
      rec.interimResults = false;
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          if (result?.isFinal) transcript.current.push(result[0].transcript.trim());
        }
      };
      recognitionEnded.current = new Promise((resolve) => {
        rec.onend = () => resolve();
        rec.onerror = () => resolve();
      });
      rec.start();
      recognition.current = rec;
    } catch {
      recognition.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    if (!recordingSupported()) {
      setStatus('unsupported');
      return;
    }
    setStatus('requesting');
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setStatus(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
      return;
    }
    stream.current = media;
    chunks.current = [];
    const mimeType = MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };
    rec.start(250);
    recorder.current = rec;
    startMeter(media);
    startRecognition();
    maxTimer.current = setTimeout(() => onMax.current?.(), maxDurationMs);
    setStatus('recording');
  }, [maxDurationMs, startMeter, startRecognition]);

  const stop = useCallback(async (): Promise<RecordingResult> => {
    const rec = recorder.current;
    if (!rec) return { audio: null, transcript: null };
    setStatus('stopping');
    const stopped = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });
    if (rec.state !== 'inactive') rec.stop();
    recognition.current?.stop();
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
    await Promise.all([stopped, Promise.race([recognitionEnded.current, timeout])]);
    recorder.current = null;
    recognition.current = null;
    release();
    const audio = chunks.current.length ? new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' }) : null;
    const text = transcript.current.join(' ').trim();
    setStatus('idle');
    return { audio, transcript: text || null };
  }, [release]);

  /** Discard the current recording ("Start Over"). */
  const cancel = useCallback(() => {
    const rec = recorder.current;
    if (rec) {
      rec.onstop = null;
      if (rec.state !== 'inactive') rec.stop();
    }
    recognition.current?.abort();
    recorder.current = null;
    recognition.current = null;
    chunks.current = [];
    release();
    setStatus(recordingSupported() ? 'idle' : 'unsupported');
  }, [release]);

  useEffect(
    () => () => {
      recognition.current?.abort();
      if (recorder.current?.state === 'recording') recorder.current.stop();
      release();
    },
    [release],
  );

  return { status, levels, start, stop, cancel };
}
