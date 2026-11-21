import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiError } from '@/api/types';
import { useAdvance, useApplyReply, useMoment, usePreferences, useRun, useStartRun, useSubmitReply } from '@/hooks/queries';
import { useLocationState } from '@/hooks/useLocationState';
import { liveReplySupported, useLiveReply } from '@/hooks/useLiveReply';
import { useRecorder } from '@/hooks/useRecorder';
import { prefetchVoice } from '@/lib/audio/voice';
import { useSpeech } from '@/lib/speech';
import type { MomentId, Reply } from '@/types/tutor';
import { buzz } from '@/lib/haptics';

/**
 * - `turn`      parent line playing / waiting for the teacher (03, 04, 10, 15)
 * - `requesting` waiting for microphone permission (05)
 * - `listening` recording (06)
 * - `checking`  reply sent, waiting for feedback
 * - `feedback`  verdict shown (07, 08, 09)
 * - `not-heard` nothing usable was captured
 */
export type ConversationPhase = 'turn' | 'requesting' | 'listening' | 'checking' | 'feedback' | 'not-heard';

export interface JustFinishedState {
  justFinished: true;
}

/** Navigation state into the conversation: `quick` = "Rehearse now" (first 3 lines). */
export interface StartState {
  quick?: boolean;
}

/**
 * How the reply reaches the backend:
 * - `live`   streamed while speaking over the realtime socket (Gemini Live; feedback ~1 s after Stop)
 * - `upload` recorded, then uploaded when the teacher stops (demo build, or when sockets are blocked)
 */
type CaptureMode = 'live' | 'upload';

const parentSpeechId = (turnId: string) => `parent:${turnId}`;

export function useConversation(momentId: MomentId) {
  const navigate = useNavigate();
  const moment = useMoment(momentId);
  const runQuery = useRun(momentId);
  const startRun = useStartRun(momentId);
  const submit = useSubmitReply(momentId);
  const applyReply = useApplyReply(momentId);
  const advance = useAdvance(momentId);
  const speak = useSpeech((s) => s.speak);
  const stopSpeech = useSpeech((s) => s.stop);
  const quick = useLocationState<StartState>()?.quick === true;
  const prefs = usePreferences();
  const [typing, setTyping] = useState<boolean | null>(null); // null = follow quiet mode

  const [phase, setPhase] = useState<ConversationPhase>('turn');
  const [reply, setReply] = useState<Reply | null>(null);
  const [mode, setMode] = useState<CaptureMode>(() => (liveReplySupported() ? 'live' : 'upload'));
  const [liveError, setLiveError] = useState<ApiError | null>(null);
  const stopRef = useRef<() => void>(() => undefined);
  const onMaxDuration = useCallback(() => stopRef.current(), []);
  const live = useLiveReply(momentId, { onMaxDuration });
  const recorder = useRecorder({ onMaxDuration });
  const capture = mode === 'live' ? live : recorder;

  // Resume the unfinished run or start a new one, once per visit.
  const started = useRef(false);
  const { mutate: start } = startRun;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start(quick ? { quick: true } : undefined);
  }, [start, quick]);

  const run = startRun.isSuccess ? (runQuery.data ?? startRun.data) : null;
  const turnAt = (index: number) => {
    const id = run?.turnIds[index];
    return (id && moment.data?.turns.find((x) => x.id === id)) || null;
  };
  const turn = run && !run.completed ? turnAt(run.turnIndex) : null;
  const nextTurn = run ? turnAt(run.turnIndex + 1) : null;
  const isBaseline = moment.data?.kind === 'baseline';
  const typingOn = typing ?? prefs.data?.quietMode ?? false;
  const speakingParent = useSpeech((s) => (turn ? s.speakingId === parentSpeechId(turn.id) : false));

  // Fetch Gemini's voice ahead of time: this line and its model reply now, the next line while
  // the teacher reads their feedback, and the grammar fix as soon as it arrives.
  useEffect(() => {
    prefetchVoice(turn?.parentLine);
    if (turn?.hint.kind === 'sentence') prefetchVoice(turn.hint.text);
  }, [turn]);
  useEffect(() => {
    if (phase !== 'feedback') return;
    prefetchVoice(reply?.feedback.fix?.better);
    prefetchVoice(nextTurn?.parentLine);
  }, [phase, reply, nextTurn]);

  // The parent says each new line once, automatically — but only after the user has interacted
  // with the page (browsers block un-prompted audio; on a cold load "Hear Again" plays it).
  const spokenTurn = useRef<string | null>(null);
  useEffect(() => {
    if (!turn || phase !== 'turn' || spokenTurn.current === turn.id) return;
    spokenTurn.current = turn.id;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    speak(turn.parentLine, parentSpeechId(turn.id));
  }, [turn, phase, speak]);

  useEffect(() => () => stopSpeech(), [stopSpeech]);

  const hearAgain = useCallback(() => {
    if (turn) speak(turn.parentLine, parentSpeechId(turn.id));
  }, [turn, speak]);

  const goOnRef = useRef<() => void>(() => undefined);
  const showReply = useCallback(
    (r: Reply) => {
      applyReply(r);
      setReply(r);
      if (!r.feedback.heard) return setPhase('not-heard');
      // The first chat is never marked: say thanks and move straight on.
      if (isBaseline) return goOnRef.current();
      buzz(r.feedback.fix ? 12 : [14, 60, 14]);
      setPhase('feedback');
    },
    [applyReply, isBaseline],
  );

  const startRecording = useCallback(async () => {
    if (!turn) return;
    stopSpeech();
    setLiveError(null);
    setPhase('requesting');
    if (mode === 'upload') {
      await recorder.start();
      return;
    }
    const result = await live.start(turn.id);
    if (result.ok || result.reason === 'denied') return; // phase follows the mic status
    if (result.reason === 'transport') {
      // Realtime socket blocked (proxy, old browser): record and upload instead, from now on.
      setMode('upload');
      await recorder.start();
      return;
    }
    setLiveError(result.error ?? null);
    setPhase('turn');
  }, [live, mode, recorder, stopSpeech, turn]);

  const stopRecording = useCallback(async () => {
    if (!turn) return;
    setPhase('checking');
    if (mode === 'live') {
      try {
        showReply(await live.finish());
      } catch (err) {
        setLiveError(err instanceof ApiError ? err : new ApiError('Something went wrong. Please try again.', 0, 'server'));
        setPhase('turn');
      }
      return;
    }
    const { audio, transcript } = await recorder.stop();
    submit.mutate({ turnId: turn.id, audio, transcript }, { onSuccess: showReply, onError: () => setPhase('turn') });
  }, [live, mode, recorder, showReply, submit, turn]);

  /** Typing fallback (FR-16): for quiet moments, or when the mic isn't an option. */
  const sendTyped = useCallback(
    (text: string) => {
      if (!turn || !text.trim()) return;
      stopSpeech();
      setLiveError(null);
      setPhase('checking');
      submit.mutate(
        { turnId: turn.id, audio: null, transcript: text.trim(), typed: true },
        { onSuccess: showReply, onError: () => setPhase('turn') },
      );
    },
    [showReply, stopSpeech, submit, turn],
  );

  useEffect(() => {
    stopRef.current = () => void stopRecording();
  }, [stopRecording]);

  const startOver = useCallback(() => {
    capture.cancel();
    setPhase('turn');
  }, [capture]);

  const sayItAgain = useCallback(() => {
    setReply(null);
    setPhase('turn');
  }, []);

  const goOn = useCallback(() => {
    advance.mutate(undefined, {
      onSuccess: (next) => {
        setReply(null);
        if (next.completed && isBaseline) {
          void navigate('/', { replace: true });
        } else if (next.completed) {
          void navigate(`/moments/${momentId}/chat`, { replace: true, state: { justFinished: true } satisfies JustFinishedState });
        } else {
          setPhase('turn');
        }
      },
      onError: () => setPhase('turn'),
    });
  }, [advance, isBaseline, momentId, navigate]);

  useEffect(() => {
    goOnRef.current = goOn;
  }, [goOn]);

  // Map microphone status onto the visible phase.
  const micStatus = capture.status;
  useEffect(() => {
    if (phase !== 'requesting') return;
    if (micStatus === 'recording') setPhase('listening');
    if (micStatus === 'denied' || micStatus === 'error' || micStatus === 'unsupported') setPhase('turn');
  }, [phase, micStatus]);

  return {
    moment: moment.data,
    run,
    turn,
    phase,
    isBaseline,
    quick: run?.kind === 'quick',
    typing: typingOn,
    setTyping,
    sendTyped,
    reply,
    speakingParent,
    levels: capture.levels,
    /** What Gemini heard so far (realtime mode). */
    caption: mode === 'live' ? live.caption : '',
    micStatus,
    isLoading: moment.isPending || startRun.isPending || (!run && !startRun.isError),
    error: moment.error ?? startRun.error ?? null,
    actionError: liveError ?? submit.error ?? advance.error ?? null,
    advancing: advance.isPending,
    retryLoad: () => {
      void moment.refetch();
      start(quick ? { quick: true } : undefined);
    },
    hearAgain,
    startRecording,
    stopRecording,
    startOver,
    sayItAgain,
    goOn,
  };
}
