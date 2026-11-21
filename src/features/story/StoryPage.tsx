import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/types';
import { t } from '@/i18n';
import { queryKeys, useDeleteStory, useStories, useTellStory } from '@/hooks/queries';
import { useBack } from '@/hooks/useBack';
import { liveReplySupported, useLiveStory } from '@/hooks/useLiveReply';
import type { Story } from '@/types/tutor';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { HeroCard } from '@/components/ui/Card';
import { CheckIcon, KeyboardIcon, MicIcon, StopIcon, TrashIcon } from '@/components/ui/Icons';
import { SaveLineButton } from '@/components/ui/SaveLineButton';
import { SpeakerButton } from '@/components/ui/SpeakerButton';
import { HighlightedText } from '@/features/conversation/ChatBubbles';

type Phase = 'idle' | 'requesting' | 'listening' | 'checking' | 'result';

/** "Tell me what happened" (FR-18): a real conversation, one tip back, children's names removed. */
export default function StoryPage() {
  const back = useBack('/');
  const qc = useQueryClient();
  const canSpeak = liveReplySupported();
  const [typing, setTyping] = useState(!canSpeak);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<Story | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finishRef = useRef<() => void>(() => undefined);
  const live = useLiveStory({ onMaxDuration: () => finishRef.current() });
  const typed = useTellStory();

  const show = useCallback(
    (story: Story) => {
      setResult(story);
      setPhase('result');
      void qc.invalidateQueries({ queryKey: queryKeys.stories });
      void qc.invalidateQueries({ queryKey: queryKeys.home });
    },
    [qc],
  );
  const fail = (err: unknown) => {
    setError(err instanceof ApiError || err instanceof Error ? err.message : t.common.errorTitle);
    setPhase('idle');
  };

  const startSpeaking = async () => {
    setError(null);
    setPhase('requesting');
    const started = await live.start();
    if (started.ok) return setPhase('listening');
    if (started.reason === 'transport') setTyping(true);
    if (started.error) setError(started.error.message);
    setPhase('idle');
  };
  const finish = useCallback(async () => {
    setPhase('checking');
    try {
      show(await live.finish());
    } catch (err) {
      fail(err);
    }
  }, [live, show]);
  useEffect(() => {
    finishRef.current = () => void finish();
  }, [finish]);

  const again = () => {
    setResult(null);
    setPhase('idle');
  };

  return (
    <Screen>
      <AppHeader title={t.story.title} onBack={back} />
      <main className="flex flex-1 flex-col px-5 pt-4 pb-8">
        {phase === 'result' && result ? (
          <StoryResult story={result} onAgain={again} />
        ) : (
          <>
            <HeroCard className="px-[18px] pt-4 pb-4">
              <p className="text-[15.5px] leading-6">{t.story.intro}</p>
              <p className="mt-2 text-[13.5px] font-semibold text-sage">{t.story.privacy}</p>
            </HeroCard>

            {phase === 'checking' || typed.isPending ? (
              <div role="status" className="mt-8 flex flex-col items-center gap-3 text-ink-2">
                <span className="flex h-10 items-center gap-2" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-3 animate-bounce rounded-full bg-action" style={{ animationDelay: `${i * 140}ms` }} />
                  ))}
                </span>
                <span className="text-[15px] font-semibold">{t.story.checking}</span>
                {live.caption && <p className="max-w-[340px] text-center text-[14px] text-ink">“{live.caption}”</p>}
              </div>
            ) : typing ? (
              <TypedStory
                busy={typed.isPending}
                onSend={(text) => typed.mutate(text, { onSuccess: show, onError: fail })}
                onSpeak={canSpeak ? () => setTyping(false) : undefined}
              />
            ) : (
              <div className="mt-8 flex flex-col items-center">
                {phase === 'listening' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void finish()}
                      aria-label={t.story.stopAndSend}
                      className="flex size-16 items-center justify-center rounded-full bg-stop text-white shadow-[0_6px_16px_rgb(217_54_54/0.35)]"
                    >
                      <StopIcon size={26} />
                    </button>
                    <p className="mt-3 text-[16px] font-bold" aria-live="polite">
                      {t.story.listening}
                    </p>
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => {
                        live.cancel();
                        setPhase('idle');
                      }}
                    >
                      {t.conversation.startOver}
                    </Button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void startSpeaking()}
                      disabled={phase === 'requesting'}
                      aria-busy={phase === 'requesting'}
                      aria-label={t.story.speak}
                      className="flex size-16 items-center justify-center rounded-full bg-action text-on-action shadow-[0_6px_16px_rgb(0_62_242/0.3)] hover:bg-action-strong"
                    >
                      <MicIcon size={28} />
                    </button>
                    <p className="mt-2 text-[16px] font-bold">{t.story.speak}</p>
                    <Button variant="ghost" size="md" className="mt-1" onClick={() => setTyping(true)}>
                      <KeyboardIcon size={17} />
                      {t.story.typeInstead}
                    </Button>
                  </>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="mt-4 text-center text-[14px] font-semibold text-stop">
                {error}
              </p>
            )}
            <EarlierStories />
          </>
        )}
      </main>
    </Screen>
  );
}

function TypedStory({ busy, onSend, onSpeak }: { busy: boolean; onSend: (text: string) => void; onSpeak?: () => void }) {
  const [text, setText] = useState('');
  return (
    <form
      className="mt-5 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSend(text.trim());
      }}
    >
      <label className="text-[15px] font-bold">
        {t.story.typeLabel}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={3000}
          placeholder={t.story.typePlaceholder}
          className="mt-1.5 block w-full resize-none rounded-[18px] border-2 border-line bg-surface px-3.5 py-2.5 text-[16px] leading-6 font-normal focus:border-action focus:outline-none"
        />
      </label>
      <Button type="submit" block disabled={!text.trim() || busy} aria-busy={busy}>
        {t.story.send}
      </Button>
      {onSpeak && (
        <Button variant="ghost" size="md" onClick={onSpeak}>
          <MicIcon size={16} />
          {t.conversation.speakInstead}
        </Button>
      )}
    </form>
  );
}

function StoryResult({ story, onAgain }: { story: Story; onAgain: () => void }) {
  if (!story.heard) {
    return (
      <div className="flex flex-col items-center gap-4 pt-6 text-center">
        <p role="alert" className="rounded-card bg-mist px-4 py-3 text-[15px] font-semibold">
          {t.story.notHeard}
        </p>
        <Button onClick={onAgain}>{t.story.another}</Button>
      </div>
    );
  }
  return (
    <article className="flex flex-col gap-3" aria-live="polite">
      <section className="rounded-card bg-sky px-4 py-3">
        <h2 className="text-[13px] font-bold tracking-wide text-action uppercase">{t.story.youSaid}</h2>
        <p className="mt-1 text-[15.5px] leading-6">
          <HighlightedText text={story.transcript} phrase={story.fix?.wrong} />
        </p>
      </section>
      <ul className="space-y-2">
        {story.positives.map((p) => (
          <li key={p} className="flex items-center gap-2.5 text-[15px] font-bold text-ok">
            <span className="flex size-[22px] items-center justify-center rounded-full bg-ok-bg">
              <CheckIcon size={13} strokeWidth={3} />
            </span>
            {p}
          </li>
        ))}
      </ul>
      {story.fix && (
        <section className="rounded-[18px] border border-line bg-mist p-3">
          <h2 className="text-[14px] font-bold text-action">{t.conversation.grammarFix}</h2>
          <p className="mt-1 text-[13.5px] text-ink-2">
            {t.conversation.insteadOf} <s>{story.fix.wrong}</s>, {t.conversation.say}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="text-[15.5px] leading-snug font-bold">“{story.fix.better}”</p>
            <SpeakerButton text={story.fix.better} speechId={`story-fix:${story.id ?? 0}`} />
          </div>
          {story.tip && (
            <p className="mt-2.5 border-t border-line pt-2 text-[13.5px] leading-5">
              <b className="text-action">{t.conversation.tip}:</b> {story.tip}
            </p>
          )}
        </section>
      )}
      {story.betterLine && (
        <section className="rounded-card bg-aqua p-3.5">
          <h2 className="text-[14px] font-bold text-action">{t.story.nextTime}</h2>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <p className="text-[16px] leading-6 font-bold">“{story.betterLine}”</p>
            <span className="flex shrink-0 gap-1.5">
              <SpeakerButton text={story.betterLine} speechId={`story-line:${story.id ?? 0}`} />
              <SaveLineButton text={story.betterLine} />
            </span>
          </div>
        </section>
      )}
      <Button className="mt-2" onClick={onAgain}>
        {t.story.another}
      </Button>
    </article>
  );
}

function EarlierStories() {
  const { data } = useStories();
  const remove = useDeleteStory();
  if (!data || data.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby="earlier-stories">
      <h2 id="earlier-stories" className="text-[16px] font-bold">
        {t.story.earlier}
      </h2>
      <ul className="mt-2 space-y-2.5">
        {data.map((s) => (
          <li key={s.id ?? s.createdAt} className="flex items-start gap-2 rounded-card border border-line px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[14.5px] leading-5">{s.transcript}</p>
              {s.betterLine && <p className="mt-1 text-[13.5px] font-bold text-action">“{s.betterLine}”</p>}
            </div>
            {s.id != null && (
              <button
                type="button"
                onClick={() => s.id != null && remove.mutate(s.id)}
                aria-label={t.story.deleteStory}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-mist"
              >
                <TrashIcon size={17} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
