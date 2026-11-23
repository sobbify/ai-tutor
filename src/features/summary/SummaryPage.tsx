import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { t } from '@/i18n';
import { useProgress, useStartRun, useSummary } from '@/hooks/queries';
import { useBack } from '@/hooks/useBack';
import { useLocationState } from '@/hooks/useLocationState';
import type { Summary } from '@/types/tutor';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { Button, ButtonLink } from '@/components/ui/Button';
import { HeroCard } from '@/components/ui/Card';
import { Confetti } from '@/components/ui/Confetti';
import { ChartIcon, CheckIcon, LockOpenIcon } from '@/components/ui/Icons';
import { Pill } from '@/components/ui/Pill';
import { SaveLineButton } from '@/components/ui/SaveLineButton';
import { SpeakerButton } from '@/components/ui/SpeakerButton';
import { CategoryBadge, SaidTry } from '@/features/conversation/ChatBubbles';
import type { JustFinishedState } from '@/features/conversation/useConversation';

/** Screens 12 (just finished) and 13 (revisit). */
export default function SummaryPage() {
  const { momentId = '' } = useParams();
  const navigate = useNavigate();
  const summary = useSummary(momentId);
  const progress = useProgress();
  const restart = useStartRun(momentId);
  const justFinished = useLocationState<JustFinishedState>()?.justFinished === true;
  const back = useBack('/');

  const { mutate: startRun } = restart;
  const redo = useCallback(() => {
    startRun({ restart: true }, { onSuccess: () => void navigate(`/moments/${momentId}`, { viewTransition: true }) });
  }, [startRun, navigate, momentId]);

  const goHome = useCallback(() => void navigate('/', { viewTransition: true }), [navigate]);
  const refetch = useCallback(() => void summary.refetch(), [summary]);

  const nextId = summary.data?.nextMomentId ?? null;
  const next = progress.data?.moments.find((m) => m.id === nextId);
  const nextHref = next && next.status !== 'locked' ? (next.status === 'done' ? `/moments/${next.id}/summary` : next.status === 'in_progress' ? `/moments/${next.id}` : `/moments/${next.id}/learn`) : null;

  return (
    <Screen>
      <AppHeader title={summary.data?.title ?? ''} onBack={back} />
      {summary.isPending ? (
        <LoadingBlock />
      ) : summary.error ? (
        <ErrorBlock error={summary.error} onRetry={refetch} />
      ) : (
        <main className="flex flex-1 flex-col px-5 pt-4 pb-[max(env(safe-area-inset-bottom),20px)]">
          <SummaryHero summary={summary.data} justFinished={justFinished} firstName={progress.data?.learner.firstName ?? ''} />
          <PractiseList summary={summary.data} />

          <div className="mt-3 flex gap-3">
            <Button variant="outline" className="flex-1" onClick={redo} disabled={restart.isPending} aria-busy={restart.isPending}>
              {t.summary.redo}
            </Button>
            {nextHref ? (
              <ButtonLink to={nextHref} className="flex-1">
                {t.summary.next}
              </ButtonLink>
            ) : (
              <Button className="flex-1" onClick={goHome}>
                {t.summary.backToJourney}
              </Button>
            )}
          </div>
          <ButtonLink to={`/moments/${momentId}/chat`} variant="ghost" size="md" className="mx-auto mt-2">
            {t.summary.seeChat}
          </ButtonLink>
          {restart.error && (
            <p role="alert" className="mt-1 text-center text-[13px] font-semibold text-stop">
              {restart.error.message}
            </p>
          )}
        </main>
      )}
    </Screen>
  );
}

function SummaryHero({ summary, justFinished, firstName }: { summary: Summary; justFinished: boolean; firstName: string }) {
  return (
    <HeroCard className="relative flex flex-col items-center overflow-hidden px-5 pt-[18px] pb-5 text-center">
      {justFinished ? (
        <>
          <Confetti />
          <span className="flex size-[52px] animate-pop items-center justify-center rounded-full bg-ok text-surface" aria-hidden="true">
            <CheckIcon size={26} strokeWidth={3} />
          </span>
          <h2 className="mt-3 text-[22px] font-bold">{t.summary.wellDone(firstName)}</h2>
          <p className="mt-1 text-[14.5px]">{t.summary.finished(summary.title)}</p>
          {summary.unlocked && (
            <Pill tone="ok" className="mt-3 animate-rise px-4 py-1.5 text-[15px] [animation-delay:500ms]">
              <LockOpenIcon size={18} />
              {t.summary.nowOpen(summary.unlocked.title)}
            </Pill>
          )}
        </>
      ) : (
        <>
          <span className="flex size-[52px] items-center justify-center rounded-full bg-sky text-action" aria-hidden="true">
            <ChartIcon size={22} />
          </span>
          <h2 className="mt-3 text-[22px] font-bold">{t.summary.yourSummary}</h2>
          <p className="mt-1 text-[14.5px] leading-5">{t.summary.latestTry(summary.title)}</p>
        </>
      )}
    </HeroCard>
  );
}

function PractiseList({ summary }: { summary: Summary }) {
  const count = summary.practise.length;
  return (
    <section aria-labelledby="practise-heading" className="mt-3 flex min-h-[260px] flex-1 flex-col rounded-[26px] border border-line bg-surface px-4 pt-3.5 pb-4">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-action text-[15px] font-bold text-on-action" aria-hidden="true">
          {count}
        </span>
        <h2 id="practise-heading" className="flex-1 text-[16px] font-bold">
          <span className="sr-only">{count} </span>
          {t.summary.sentencesToPractise(count)}
        </h2>
        {summary.previousPractiseCount !== null && (
          <span className="text-[13px] text-ink-2">{t.summary.lastTime(summary.previousPractiseCount)}</span>
        )}
      </div>
      {count === 0 ? (
        <p className="mt-4 rounded-[20px] bg-ok-bg px-4 py-3 text-[14.5px] font-semibold text-ok">{t.summary.nothingToPractise}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {summary.practise.map((item) => (
            <li key={item.turnId} className="flex animate-rise items-center gap-3 rounded-[20px] bg-mist py-3 pr-3 pl-3">
              <div className="flex-1">
                <CategoryBadge category={item.category} />
                <p className="sr-only">
                  {t.summary.youSaid} {item.transcript}. {t.summary.better} “{item.fix.better}”{item.tip ? ` ${t.conversation.tip}: ${item.tip}` : ''}
                </p>
                <div className="mt-1.5" aria-hidden="true">
                  <SaidTry transcript={item.transcript} fix={item.fix} tip={item.tip} compact />
                </div>
              </div>
              <span className="flex shrink-0 flex-col gap-1.5">
                <SpeakerButton text={item.fix.better} speechId={`summary:${item.turnId}`} />
                <SaveLineButton text={item.fix.better} momentId={summary.momentId} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
