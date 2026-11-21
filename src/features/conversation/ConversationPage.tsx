import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { useBack } from '@/hooks/useBack';
import { useUIStore } from '@/stores/uiStore';
import type { Moment, Reply, Run } from '@/types/tutor';
import type { RecorderStatus } from '@/hooks/useRecorder';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { Button } from '@/components/ui/Button';
import { KeyboardIcon, MicIcon, SpeakerIcon, StopIcon } from '@/components/ui/Icons';
import { Pill } from '@/components/ui/Pill';
import { ProgressBar } from '@/components/ui/Progress';
import { AvatarStage } from './AvatarStage';
import { sceneFor } from './portraitLook';
import { FeedbackCard, ParentBubble, UserBubble } from './ChatBubbles';
import { HintPanel } from './HintPanel';
import { useConversation, type ConversationPhase } from './useConversation';

/** Screens 03–10 and 15: one parent line at a time, speak a reply, get feedback. */
export default function ConversationPage() {
  const { momentId = '' } = useParams();
  const c = useConversation(momentId);
  const chatVisible = useUIStore((s) => s.chatVisible);
  const toggleChat = useUIStore((s) => s.toggleChat);
  const back = useBack('/');

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

  return (
    <Screen className="h-dvh min-h-0">
      <AppHeader title={moment.title} onBack={back} />

      <div className="flex h-[52px] shrink-0 items-center gap-3.5 border-b border-line px-5">
        <span className="shrink-0 text-[13.5px] font-bold text-ink-2" aria-hidden="true">
          {t.conversation.responseOf(position, total)}
        </span>
        {c.quick && <Pill className="shrink-0 text-[12px]">{t.conversation.quick}</Pill>}
        <ProgressBar value={position} max={total} label={t.conversation.responseOf(position, total)} className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          onClick={toggleChat}
          aria-pressed={chatVisible}
          className={cn(chatVisible && 'bg-sky!')}
        >
          {chatVisible ? t.conversation.hideChat : t.conversation.showChat}
        </Button>
      </div>

      <main className={cn('flex min-h-0 flex-1 flex-col', chatVisible ? 'overflow-hidden' : 'overflow-y-auto', phase === 'feedback' && 'bg-mist')}>
        <div className={cn('shrink-0', (phase === 'feedback' || chatVisible) && 'bg-surface pb-3', phase === 'feedback' && !chatVisible && 'pb-4')}>
          <AvatarStage
            character={moment.character}
            line={turn.parentLine}
            speaking={c.speakingParent}
            compact={chatVisible ? 'chat' : phase === 'feedback' ? 'feedback' : false}
            videoUrl={turn.videoUrl}
            scene={sceneFor(moment)}
            mood={turn.mood}
          />
        </div>

        {chatVisible ? (
          <ChatHistory moment={moment} run={run} phase={phase} reply={c.reply} />
        ) : phase === 'feedback' && c.reply ? (
          <div className="px-4 pt-4 pb-6">
            <FeedbackCard reply={c.reply} momentId={moment.id} />
          </div>
        ) : (
          <div className="flex flex-col items-center px-10 pt-3 pb-6">
            <p className="text-center text-[14px] leading-[21px] text-ink-2">{moment.scene}</p>
            {phase === 'turn' && (
              <Button variant="outline" size="md" className="mt-3 w-40" onClick={c.hearAgain}>
                <SpeakerIcon size={18} />
                {t.conversation.hearAgain}
              </Button>
            )}
          </div>
        )}
      </main>

      <Footer c={c} firstTurn={run.turnIndex === 0} />
      <Announcer phase={phase} reply={c.reply} />
    </Screen>
  );
}

function ChatHistory({ moment, run, phase, reply }: { moment: Moment; run: Run; phase: ConversationPhase; reply: Reply | null }) {
  const list = useRef<HTMLOListElement>(null);
  const items = run.turnIds
    .slice(0, run.turnIndex + 1)
    .map((id) => moment.turns.find((x) => x.id === id))
    .filter((x): x is Moment['turns'][number] => Boolean(x));
  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [run.turnIndex, phase]);

  return (
    <ol
      ref={list}
      aria-label={t.conversation.chatLabel}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto border-t border-line bg-mist px-4 pt-3 pb-4"
    >
      {items.map((turn, i) => {
        const isCurrent = i === run.turnIndex;
        const past = run.replies.find((r) => r.turnId === turn.id);
        return [
          <ParentBubble key={`${turn.id}-p`} character={moment.character} text={turn.parentLine} speechId={`chat:${turn.id}`} />,
          isCurrent ? (
            phase === 'feedback' && reply ? <FeedbackCard key={`${turn.id}-f`} reply={reply} momentId={moment.id} as="li" /> : null
          ) : past ? (
            <UserBubble key={`${turn.id}-r`} reply={past} />
          ) : null,
        ];
      })}
    </ol>
  );
}

type Conversation = ReturnType<typeof useConversation>;

function Footer({ c, firstTurn }: { c: Conversation; firstTurn: boolean }) {
  const { phase, turn } = c;
  if (!turn) return null;

  if (phase === 'feedback') {
    return (
      <footer className="flex shrink-0 gap-3 border-t border-line bg-surface px-5 pt-3 pb-[max(env(safe-area-inset-bottom),16px)]">
        <Button variant="outline" className="flex-1" onClick={c.sayItAgain} disabled={c.advancing}>
          {t.conversation.sayItAgain}
        </Button>
        <Button className="flex-1" onClick={c.goOn} disabled={c.advancing} aria-busy={c.advancing}>
          {t.conversation.continue}
        </Button>
      </footer>
    );
  }

  if (phase === 'listening') {
    return (
      <footer className="flex shrink-0 flex-col items-center border-t border-line px-5 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <button
          type="button"
          onClick={() => void c.stopRecording()}
          aria-label={t.conversation.stopRecording}
          className="flex size-16 items-center justify-center rounded-full bg-stop text-white shadow-[0_6px_16px_rgb(217_54_54/0.35)] hover:brightness-95"
        >
          <StopIcon size={26} />
        </button>
        <div className="mt-3 flex items-center gap-4">
          <Waveform levels={c.levels} />
          <span className="text-[16px] font-bold">{t.conversation.listening}</span>
        </div>
        <p className="mt-0.5 text-[13px] text-ink-2">{t.conversation.takeYourTime}</p>
        <Button variant="ghost" size="md" className="mt-1" onClick={c.startOver}>
          {t.conversation.startOver}
        </Button>
      </footer>
    );
  }

  if (phase === 'checking') {
    return (
      <footer className="flex min-h-[180px] shrink-0 flex-col items-center justify-center gap-3 border-t border-line px-6 py-4 text-ink-2" role="status">
        <span className="flex h-10 items-center gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-3 animate-bounce rounded-full bg-action" style={{ animationDelay: `${i * 140}ms` }} />
          ))}
        </span>
        <span className="text-[15px] font-semibold">{t.conversation.checking}</span>
        {c.caption && (
          <p className="line-clamp-3 max-w-[340px] text-center text-[14px] leading-[20px] text-ink">
            <span className="sr-only">{t.conversation.youSaid}: </span>“{c.caption}”
          </p>
        )}
      </footer>
    );
  }

  const requesting = phase === 'requesting';
  if (c.typing && !requesting) {
    return (
      <footer className="flex shrink-0 flex-col border-t border-line px-5 pt-3 pb-[max(env(safe-area-inset-bottom),14px)]">
        {phase === 'not-heard' ? (
          <p role="alert" className="rounded-card bg-mist px-4 py-3 text-center text-[14.5px] font-semibold text-ink">
            {t.conversation.notHeard}
          </p>
        ) : (
          <HintPanel hint={turn.hint} turnId={turn.id} />
        )}
        <TypingBox key={turn.id} onSend={c.sendTyped} />
        <Button variant="ghost" size="md" className="mt-1 self-center" onClick={() => c.setTyping(false)}>
          <MicIcon size={16} />
          {t.conversation.speakInstead}
        </Button>
        {c.actionError && (
          <p role="alert" className="mt-1 text-center text-[13px] font-semibold text-stop">
            {c.actionError.message}
          </p>
        )}
      </footer>
    );
  }
  return (
    <footer className="flex shrink-0 flex-col border-t border-line px-5 pt-3 pb-[max(env(safe-area-inset-bottom),14px)]">
      {phase === 'not-heard' ? (
        <p role="alert" className="rounded-card bg-mist px-4 py-3 text-center text-[14.5px] font-semibold text-ink">
          {t.conversation.notHeard}
        </p>
      ) : (
        <HintPanel hint={turn.hint} turnId={turn.id} />
      )}
      <div className="mt-4 flex flex-col items-center">
        <button
          type="button"
          onClick={() => void c.startRecording()}
          disabled={requesting}
          aria-busy={requesting}
          aria-label={t.conversation.startRecording}
          className={cn(
            'relative flex size-16 items-center justify-center rounded-full bg-action text-on-action shadow-[0_6px_16px_rgb(0_62_242/0.3)] transition-transform hover:bg-action-strong active:scale-95',
            requesting && 'animate-pulse',
          )}
        >
          <MicIcon size={28} />
        </button>
        <p className="mt-2 text-[16px] font-bold">{phase === 'not-heard' ? t.conversation.tryAgain : t.conversation.tapToSpeak}</p>
        <MicMessage status={c.micStatus} requesting={requesting} firstTurn={firstTurn} />
        {!requesting && (
          <Button variant="ghost" size="md" className="mt-0.5 h-9 text-[15px]" onClick={() => c.setTyping(true)}>
            <KeyboardIcon size={17} />
            {t.conversation.typeInstead}
          </Button>
        )}
        {c.actionError && (
          <p role="alert" className="mt-1 text-center text-[13px] font-semibold text-stop">
            {c.actionError.message}
          </p>
        )}
      </div>
    </footer>
  );
}

function TypingBox({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <form
      className="mt-3 flex items-end gap-2"
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
      <p role="alert" className="mt-1 max-w-[300px] text-center text-[13px] font-semibold text-stop">
        {problem}
      </p>
    );
  }
  if (requesting) return <p className="text-[12.5px] text-ink-2">{t.conversation.waitingForMic}</p>;
  if (firstTurn) return <p className="text-[12.5px] text-ink-2">{t.conversation.accentNote}</p>;
  return null;
}

function Waveform({ levels }: { levels: number[] }) {
  return (
    <span className="flex h-8 items-center gap-1.5" aria-hidden="true">
      {levels.map((level, i) => (
        <span
          // Fixed set of five bars.
          key={i}
          className="w-[9px] rounded-full bg-action transition-[height] duration-75"
          style={{ height: `${Math.round(10 + level * 22)}px` }}
        />
      ))}
    </span>
  );
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
