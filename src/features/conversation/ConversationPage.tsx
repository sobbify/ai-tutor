import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { useBack } from '@/hooks/useBack';
import { useCamera, type CameraStatus } from '@/hooks/useCamera';
import type { Moment, Reply, Run } from '@/types/tutor';
import type { RecorderStatus } from '@/hooks/useRecorder';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { Button } from '@/components/ui/Button';
import {
  ArrowRightIcon,
  CameraIcon,
  CameraOffIcon,
  CaptionsIcon,
  KeyboardIcon,
  MicIcon,
  PhoneDownIcon,
  StopIcon,
} from '@/components/ui/Icons';
import { Pill } from '@/components/ui/Pill';
import { ProgressBar } from '@/components/ui/Progress';
import { AvatarStage } from './AvatarStage';
import { CorrectionCard, LiveBubble, ParentBubble, UserBubble } from './ChatBubbles';
import { HintPanel } from './HintPanel';
import { sceneFor } from './portraitLook';
import { useConversation, type ConversationPhase } from './useConversation';

/** How long a correction floats before it docks into the chat (a "Well said!" goes sooner). */
const FIX_SECONDS = 9;
const PRAISE_SECONDS = 4;

/**
 * The role-play as a video call (the layout of the Live tutor's call screen): the parent on screen
 * with her own camera picture-in-picture, a live transcript of both sides, a correction card that
 * floats up with the slip clearly marked and then docks into the chat, and call controls.
 */
export default function ConversationPage() {
  const { momentId = '' } = useParams();
  const c = useConversation(momentId);
  const back = useBack('/');
  const camera = useCamera();
  const [captions, setCaptions] = useState(true);
  const [docked, setDocked] = useState<string | null>(null);

  const replyKey = c.reply ? `${c.reply.turnId}:${c.reply.attempt}` : null;
  const cardOpen = c.phase === 'feedback' && Boolean(c.reply) && docked !== replyKey;
  const seconds = c.reply?.feedback.fix ? FIX_SECONDS : PRAISE_SECONDS;
  useEffect(() => {
    if (!cardOpen || !replyKey) return;
    const timer = setTimeout(() => setDocked(replyKey), seconds * 1000);
    return () => clearTimeout(timer);
  }, [cardOpen, replyKey, seconds]);

  if (c.isLoading || c.error || !c.moment || !c.run || !c.turn) {
    return (
      <Screen>
        <AppHeader title={c.moment?.title ?? ''} onBack={back} />
        {c.error ? <ErrorBlock error={c.error} onRetry={c.retryLoad} /> : <LoadingBlock />}
      </Screen>
    );
  }

  const { moment, run, turn, phase } = c;
  const total = run.turnIds.length;
  const position = run.turnIndex + 1;
  const waiting = phase === 'turn' || phase === 'not-heard';

  return (
    <Screen className="h-dvh min-h-0">
      <AppHeader title={moment.title} onBack={back} right={<CallTimer />} />

      <div className="flex h-11 shrink-0 items-center gap-3 px-5">
        <span className="shrink-0 text-[13.5px] font-bold text-ink-2" aria-hidden="true">
          {t.conversation.responseOf(position, total)}
        </span>
        {c.quick && <Pill className="shrink-0 text-[12px]">{t.conversation.quick}</Pill>}
        <ProgressBar value={position} max={total} label={t.conversation.responseOf(position, total)} className="flex-1" />
      </div>

      <main className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0">
          <AvatarStage
            character={moment.character}
            line={turn.parentLine}
            speaking={c.speakingParent}
            compact={cardOpen ? 'feedback' : false}
            videoUrl={turn.videoUrl}
            scene={sceneFor(moment)}
            mood={turn.mood}
            thinking={phase === 'checking'}
            onHearAgain={waiting ? c.hearAgain : undefined}
            pip={<SelfView status={camera.status} stream={camera.stream} small={cardOpen} />}
          />
        </div>

        {captions ? (
          <Transcript moment={moment} run={run} phase={phase} reply={c.reply} caption={c.caption} cardOpen={cardOpen} baseline={c.isBaseline} />
        ) : (
          <p className="flex flex-1 items-center justify-center px-8 text-center text-[14px] text-ink-2">{t.conversation.captionsOff}</p>
        )}

        {cardOpen && c.reply && (
          <div className="shrink-0 px-4 pb-2">
            <CorrectionCard reply={c.reply} momentId={moment.id} seconds={seconds} onDismiss={() => setDocked(replyKey)} onRetry={c.sayItAgain} />
          </div>
        )}

        {waiting && (
          <div className="shrink-0 px-4 pb-2">
            {phase === 'not-heard' ? (
              <p role="alert" className="rounded-card bg-mist px-4 py-3 text-center text-[14.5px] font-semibold text-ink">
                {t.conversation.notHeard}
              </p>
            ) : c.typing ? null : (
              <HintPanel hint={turn.hint} turnId={turn.id} />
            )}
            {c.typing && <TypingBox key={turn.id} onSend={c.sendTyped} />}
          </div>
        )}
      </main>

      <CallControls c={c} camera={camera} captions={captions} onCaptions={() => setCaptions((v) => !v)} onLeave={back} cardOpen={cardOpen} />
      <Announcer phase={phase} reply={c.reply} />
    </Screen>
  );
}

/** Elapsed practice time, like a call timer. */
function CallTimer() {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const s = Math.floor((now - start) / 1000);
  return (
    <span className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full bg-white px-3 text-[14px] font-extrabold text-[#2c2b2b] tabular-nums" role="timer" aria-label={t.conversation.callTime}>
      <span className="size-2 rounded-full bg-stop" aria-hidden="true" />
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </span>
  );
}

/** Her own camera, picture-in-picture (mirrored, never sent or recorded). */
function SelfView({ status, stream, small }: { status: CameraStatus; stream: MediaStream | null; small: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  if (status !== 'on' || !stream) return null;
  return (
    <div
      className={cn(
        'absolute top-3 right-3 overflow-hidden rounded-[14px] border-2 border-white bg-black shadow-soft transition-[width,height] duration-300',
        small ? 'h-[76px] w-[58px]' : 'h-[104px] w-[80px]',
      )}
    >
      <video ref={video} className="size-full -scale-x-100 object-cover" autoPlay playsInline muted aria-label={t.conversation.you} />
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-2 text-[10.5px] font-bold text-white">{t.conversation.you}</span>
    </div>
  );
}

function Transcript({
  moment,
  run,
  phase,
  reply,
  caption,
  cardOpen,
  baseline,
}: {
  moment: Moment;
  run: Run;
  phase: ConversationPhase;
  reply: Reply | null;
  caption: string;
  cardOpen: boolean;
  baseline: boolean;
}) {
  const list = useRef<HTMLOListElement>(null);
  const items = run.turnIds
    .slice(0, run.turnIndex + 1)
    .map((id) => moment.turns.find((x) => x.id === id))
    .filter((x): x is Moment['turns'][number] => Boolean(x));

  // Keep the newest words in view as the conversation grows — and while the parent's tile resizes
  // (it shrinks for the correction card and grows back when the card docks).
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const toEnd = () => {
      el.scrollTop = el.scrollHeight;
    };
    toEnd();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(toEnd);
    watch.observe(el);
    const stop = setTimeout(() => watch.disconnect(), 600);
    return () => {
      clearTimeout(stop);
      watch.disconnect();
    };
  }, [run.turnIndex, phase, caption, cardOpen, reply]);

  const plain = (r: Reply): Reply => ({ ...r, feedback: { ...r.feedback, fix: null } });

  return (
    <ol ref={list} aria-label={t.conversation.chatLabel} className="flex min-h-[96px] flex-1 flex-col gap-2.5 overflow-y-auto px-4 pt-3 pb-3">
      <li className="mx-auto max-w-[320px] rounded-full bg-mist px-3.5 py-1.5 text-center text-[12.5px] leading-[18px] text-ink-2">
        <b className="font-bold text-ink">{t.conversation.sceneLabel}:</b> {moment.scene}
      </li>
      {items.map((turn, i) => {
        const isCurrent = i === run.turnIndex;
        const past = run.replies.find((r) => r.turnId === turn.id);
        const parent = <ParentBubble key={`${turn.id}-p`} character={moment.character} text={turn.parentLine} speechId={`chat:${turn.id}`} />;
        if (!isCurrent) return [parent, past ? <UserBubble key={`${turn.id}-r`} reply={baseline ? plain(past) : past} showCorrection={!baseline} /> : null];
        let mine: ReactNode = null;
        if (phase === 'listening' || phase === 'checking') {
          mine = <LiveBubble key={`${turn.id}-live`} text={caption} active={phase === 'listening' || !caption} />;
        } else if (phase === 'feedback' && reply) {
          // While the card floats, her bubble shows the marked slip only; then the correction docks here.
          mine = <UserBubble key={`${turn.id}-now`} reply={baseline ? plain(reply) : reply} showCorrection={!cardOpen && !baseline} />;
        }
        return [parent, mine];
      })}
    </ol>
  );
}

type Conversation = ReturnType<typeof useConversation>;

function RoundButton({
  label,
  pressed,
  onClick,
  tone = 'idle',
  disabled,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  tone?: 'idle' | 'on' | 'end';
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        'flex size-12 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40',
        tone === 'on' && 'bg-action text-on-action',
        tone === 'idle' && 'bg-mist text-ink hover:bg-line',
        tone === 'end' && 'bg-stop text-white hover:brightness-95',
      )}
    >
      {children}
    </button>
  );
}

function CallControls({
  c,
  camera,
  captions,
  onCaptions,
  onLeave,
  cardOpen,
}: {
  c: Conversation;
  camera: ReturnType<typeof useCamera>;
  captions: boolean;
  onCaptions: () => void;
  onLeave: () => void;
  cardOpen: boolean;
}) {
  const { phase } = c;
  const level = c.levels.length ? c.levels.reduce((a, b) => a + b, 0) / c.levels.length : 0;
  const requesting = phase === 'requesting';
  const camOn = camera.status === 'on';

  let status: ReactNode = null;
  if (phase === 'listening') {
    status = (
      <>
        <span className="font-bold text-ink">{t.conversation.listening}</span> {t.conversation.takeYourTime}
      </>
    );
  } else if (phase === 'checking') {
    status = <span className="font-semibold">{t.conversation.checking}</span>;
  } else if (phase === 'turn' || phase === 'not-heard' || requesting) {
    status = <span className="font-bold text-ink">{phase === 'not-heard' ? t.conversation.tryAgain : t.conversation.tapToSpeak}</span>;
  }

  let main: ReactNode;
  if (phase === 'listening') {
    main = (
      <button
        type="button"
        onClick={() => void c.stopRecording()}
        aria-label={t.conversation.stopRecording}
        className="flex size-16 items-center justify-center rounded-full bg-stop text-white transition-shadow duration-75 hover:brightness-95"
        style={{ boxShadow: `0 6px 16px rgb(217 54 54 / 0.35), 0 0 0 ${Math.round(level * 12)}px rgb(217 54 54 / 0.18), 0 0 0 ${Math.round(level * 22)}px rgb(217 54 54 / 0.08)` }}
      >
        <StopIcon size={26} />
      </button>
    );
  } else if (phase === 'checking') {
    main = (
      <span className="flex size-16 items-center justify-center gap-1.5 rounded-full bg-sky" role="status" aria-label={t.conversation.checking}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2.5 animate-bounce rounded-full bg-action" style={{ animationDelay: `${i * 140}ms` }} />
        ))}
      </span>
    );
  } else if (phase === 'feedback') {
    main = (
      <button
        type="button"
        onClick={c.goOn}
        disabled={c.advancing}
        aria-busy={c.advancing}
        aria-label={t.conversation.continue}
        className="flex h-16 items-center gap-2 rounded-full bg-action px-6 text-[17px] font-bold text-on-action shadow-[0_6px_16px_rgb(0_62_242/0.3)] hover:bg-action-strong disabled:opacity-60"
      >
        {t.conversation.continue}
        <ArrowRightIcon size={20} />
      </button>
    );
  } else {
    main = (
      <button
        type="button"
        onClick={() => {
          c.setTyping(false);
          void c.startRecording();
        }}
        disabled={requesting}
        aria-busy={requesting}
        aria-label={t.conversation.startRecording}
        className={cn(
          'flex size-16 items-center justify-center rounded-full bg-action text-on-action shadow-[0_6px_16px_rgb(0_62_242/0.3)] transition-transform hover:bg-action-strong active:scale-95',
          requesting && 'animate-pulse',
        )}
      >
        <MicIcon size={28} />
      </button>
    );
  }

  return (
    <footer className="shrink-0 border-t border-line bg-surface px-4 pt-2 pb-[max(env(safe-area-inset-bottom),12px)]">
      {status && <p className="min-h-5 text-center text-[13.5px] text-ink-2">{status}</p>}
      <MicMessage status={c.micStatus} requesting={requesting} firstTurn={c.run?.turnIndex === 0 && phase === 'turn'} />
      {c.actionError && (
        <p role="alert" className="text-center text-[13px] font-semibold text-stop">
          {c.actionError.message}
        </p>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <RoundButton label={camOn ? t.conversation.cameraOff : t.conversation.cameraOn} pressed={camOn} tone={camOn ? 'on' : 'idle'} onClick={camera.toggle} disabled={camera.status === 'starting'}>
          {camOn ? <CameraIcon size={22} /> : <CameraOffIcon size={22} />}
        </RoundButton>
        <RoundButton label={t.conversation.captions} pressed={captions} tone={captions ? 'on' : 'idle'} onClick={onCaptions}>
          <CaptionsIcon size={22} />
        </RoundButton>
        {main}
        <RoundButton
          label={c.typing ? t.conversation.speakInstead : t.conversation.typeInstead}
          pressed={c.typing}
          tone={c.typing ? 'on' : 'idle'}
          onClick={() => c.setTyping(!c.typing)}
          disabled={phase !== 'turn' && phase !== 'not-heard'}
        >
          <KeyboardIcon size={22} />
        </RoundButton>
        <RoundButton label={t.conversation.leave} tone="end" onClick={onLeave}>
          <PhoneDownIcon size={22} />
        </RoundButton>
      </div>
      {phase === 'listening' && (
        <div className="mt-0.5 flex justify-center">
          <Button variant="ghost" size="md" className="h-9 text-[15px]" onClick={c.startOver}>
            {t.conversation.startOver}
          </Button>
        </div>
      )}
      {phase === 'feedback' && !(cardOpen && c.reply?.feedback.fix) && (
        <div className="mt-0.5 flex justify-center">
          <Button variant="ghost" size="md" className="h-9 text-[15px]" onClick={c.sayItAgain} disabled={c.advancing}>
            {t.conversation.sayItAgain}
          </Button>
        </div>
      )}
      {camera.status === 'blocked' && <p className="mt-1 text-center text-[12.5px] text-ink-2">{t.conversation.cameraBlocked}</p>}
    </footer>
  );
}

function TypingBox({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSend(text);
      }}
    >
      <label className="flex-1">
        <span className="sr-only">{t.conversation.typeLabel}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={t.conversation.typePlaceholder}
          className="block w-full resize-none rounded-[18px] border-2 border-line bg-surface px-3.5 py-2.5 text-[16px] leading-6 focus:border-action focus:outline-none"
        />
      </label>
      <Button type="submit" size="md" disabled={!text.trim()}>
        {t.conversation.send}
      </Button>
    </form>
  );
}

function MicMessage({ status, requesting, firstTurn }: { status: RecorderStatus; requesting: boolean; firstTurn: boolean }) {
  const problem =
    status === 'denied' ? t.conversation.micBlocked : status === 'unsupported' ? t.conversation.micUnsupported : status === 'error' ? t.conversation.micError : null;
  if (problem) {
    return (
      <p role="alert" className="mx-auto max-w-[320px] text-center text-[13px] font-semibold text-stop">
        {problem}
      </p>
    );
  }
  if (requesting) return <p className="text-center text-[12.5px] text-ink-2">{t.conversation.waitingForMic}</p>;
  if (firstTurn) return <p className="text-center text-[12.5px] text-ink-2">{t.conversation.accentNote}</p>;
  return null;
}

/** Screen-reader announcements for phase changes. */
function Announcer({ phase, reply }: { phase: ConversationPhase; reply: Reply | null }) {
  let message = '';
  if (phase === 'listening') message = t.conversation.listening;
  else if (phase === 'checking') message = t.conversation.checking;
  else if (phase === 'not-heard') message = t.conversation.notHeard;
  else if (phase === 'feedback' && reply) {
    const fix = reply.feedback.fix;
    message = [...reply.feedback.positives, fix ? `${t.conversation.grammarFix}: ${fix.better}` : ''].filter(Boolean).join('. ');
  }
  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  );
}
