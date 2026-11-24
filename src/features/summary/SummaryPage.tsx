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
import { CategoryBadge, HighlightedText, SaidTry } from '@/features/conversation/ChatBubbles';
import { groupSlips, slipsOf } from '@/lib/slips';
import type { JustFinishedState } from '@/features/conversation/useConversation';
import { SnowflakeReward } from './SnowflakeReward';

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
          {justFinished && summary.data.snowflakes && <SnowflakeReward snowflakes={summary.data.snowflakes} />}
          <ImprovedList summary={summary.data} />
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

/** Lines she got right after slipping on them, with what she fixed in green: her progress. */
function ImprovedList({ summary }: { summary: Summary }) {
  const items = summary.improved ?? [];
  if (!items.length) return null;
  return (
    <section aria-labelledby="improved-heading" className="mt-3 animate-rise rounded-[26px] border-2 border-ok-dot/60 bg-surface px-4 pt-3.5 pb-4">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ok-bg text-ok" aria-hidden="true">
          <CheckIcon size={17} strokeWidth={3} />
        </span>
        <div>
          <h2 id="improved-heading" className="text-[16px] font-bold">
            {t.summary.improvedTitle}
          </h2>
          <p className="text-[13px] leading-[18px] text-ink-2">{t.summary.improvedIntro}</p>
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-2.5">
        {items.map((item) => (
          <li key={`${item.turnId}:${item.when}`} className="rounded-[20px] bg-ok-bg/50 px-3 py-2.5">
            <p className="text-[11.5px] font-extrabold tracking-wide text-ok uppercase">
              {item.when === 'again' ? t.summary.improvedAgain : t.summary.improvedLastTime}
            </p>
            <p className="mt-1 text-[13.5px] leading-snug text-ink-2">
              <span className="mr-1.5 text-[11.5px] font-extrabold tracking-wide uppercase">{t.summary.before}</span>
              <HighlightedText text={item.before} phrases={item.beforeWrongs} underline />
            </p>
            <p className="mt-1 text-[15.5px] leading-snug font-bold text-ink">
              <span className="mr-1.5 text-[11.5px] font-extrabold tracking-wide text-ok uppercase">{t.summary.now}</span>
              <HighlightedText text={item.after} improved={item.words} />
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PractiseList({ summary }: { summary: Summary }) {
  const count = summary.practise.length;
  // Every slip from every line, sorted into its category (Tense, A / an / the, …).
  const slips = summary.practise.flatMap((item) => slipsOf(item).map((slip, i) => ({ ...slip, transcript: item.transcript, key: `${item.turnId}:${i}` })));
  const together = summary.practise.filter((item) => item.corrected);
  return (
    <section aria-labelledby="practise-heading" className="mt-3 flex min-h-[260px] flex-1 flex-col rounded-[26px] border border-line bg-surface px-4 pt-3.5 pb-4">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-action text-[15px] font-bold text-on-action" aria-hidden="true">
          {count}
        </span>
        <h2 id="practise-heading" className="flex-1 text-[16px] font-bold">
          <span className="sr-only">{count} </span>
          {t.summary.sentencesToPractise(count)}
          {slips.length > count && <span className="block text-[13px] font-semibold text-ink-2">{t.conversation.slipCount(slips.length)}</span>}
        </h2>
        {summary.previousPractiseCount !== null && (
          <span className="text-[13px] text-ink-2">{t.summary.lastTime(summary.previousPractiseCount)}</span>
        )}
      </div>
      {count === 0 ? (
        <p className="mt-4 rounded-[20px] bg-ok-bg px-4 py-3 text-[14.5px] font-semibold text-ok">{t.summary.nothingToPractise}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3.5">
          {groupSlips(slips).map((group) => (
            <section key={group.category} aria-label={t.conversation.categories[group.category] ?? group.category}>
              <p className="flex items-center gap-1.5">
                <CategoryBadge category={group.category} />
                {group.slips.length > 1 && <span className="text-[12px] font-extrabold text-ink-2">× {group.slips.length}</span>}
              </p>
              <ul className="mt-2 flex flex-col gap-2.5">
                {group.slips.map((slip) => (
                  <li key={slip.key} className="flex animate-rise items-center gap-3 rounded-[20px] bg-mist py-3 pr-3 pl-3">
                    <div className="flex-1">
                      <p className="sr-only">
                        {t.summary.youSaid} {slip.transcript}. {t.summary.better} “{slip.better}”{slip.tip ? ` ${t.conversation.tip}: ${slip.tip}` : ''}
                      </p>
                      <div aria-hidden="true">
                        <SaidTry transcript={slip.transcript} fix={slip} tip={slip.tip} compact condensed={slips.length > 1} />
                      </div>
                    </div>
                    <span className="flex shrink-0 flex-col gap-1.5">
                      <SpeakerButton text={slip.better} speechId={`summary:${slip.key}`} />
                      <SaveLineButton text={slip.better} momentId={summary.momentId} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {together.length > 0 && (
            <section aria-label={t.conversation.allTogether}>
              <p className="text-[12px] font-extrabold tracking-wide text-ok uppercase">{t.conversation.allTogether}</p>
              <ul className="mt-2 flex flex-col gap-2.5">
                {together.map((item) => (
                  <li key={item.turnId} className="flex items-center gap-3 rounded-[20px] border-2 border-ok-dot/60 bg-ok-bg/60 py-2.5 pr-3 pl-3">
                    <p className="flex-1 text-[15px] leading-snug font-bold">{item.corrected}</p>
                    <span className="flex shrink-0 flex-col gap-1.5">
                      <SpeakerButton text={item.corrected ?? ''} speechId={`summary:${item.turnId}:together`} />
                      <SaveLineButton text={item.corrected ?? ''} momentId={summary.momentId} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
