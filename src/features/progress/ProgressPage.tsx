import { memo, useCallback } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { useProgress } from '@/hooks/queries';
import { useBack } from '@/hooks/useBack';
import type { MomentProgress, Trends } from '@/types/tutor';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { ButtonLink } from '@/components/ui/Button';
import { HeroCard } from '@/components/ui/Card';
import { ChartIcon, CheckIcon } from '@/components/ui/Icons';
import { Pill } from '@/components/ui/Pill';
import { SegmentedProgress } from '@/components/ui/Progress';
import { currentMomentId, doneCount } from '@/features/journey/journeyState';

/** Screens 16 (progress) and 17 (empty). */
export default function ProgressPage() {
  const { data, isPending, error, refetch } = useProgress();
  const back = useBack('/');
  const retry = useCallback(() => void refetch(), [refetch]);

  return (
    <Screen>
      <AppHeader title={t.progress.title} onBack={back} />
      <main className="flex flex-1 flex-col px-5 pt-4 pb-8">
        {isPending ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} onRetry={retry} />
        ) : doneCount(data.moments) === 0 ? (
          <EmptyProgress startHref={`/moments/${currentMomentId(data.moments.filter((m) => m.kind === 'programme')) ?? data.moments[0]?.id ?? ''}/learn`} />
        ) : (
          <>
            <ProgressDetails moments={[...data.moments].sort((a, b) => a.order - b.order)} />
            <TrendsCard trends={data.trends} />
          </>
        )}
      </main>
    </Screen>
  );
}

/** Gentle trends (FR-21): words only, no numbers or grades beyond days practised. */
function TrendsCard({ trends }: { trends: Trends }) {
  const lines = [
    t.progress.daysPractised(trends.daysPractised),
    trends.fillers ? t.progress.fillers[trends.fillers] : null,
    trends.grammarSlips ? t.progress.grammarSlips[trends.grammarSlips] : null,
  ].filter((x): x is string => Boolean(x));
  return (
    <section aria-labelledby="trends" className="mt-5 rounded-card bg-aqua px-4 pt-3 pb-3.5">
      <h2 id="trends" className="text-[16px] font-bold">
        {t.progress.trendsHeading}
      </h2>
      <ul className="mt-1.5 space-y-1.5">
        {lines.map((line) => (
          <li key={line} className="flex items-center gap-2 text-[14.5px] leading-5">
            <CheckIcon size={15} className="shrink-0 text-ok" />
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyProgress({ startHref }: { startHref: string }) {
  return (
    <>
      <HeroCard className="flex flex-col items-center px-6 pt-7 pb-8 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-surface text-action" aria-hidden="true">
          <ChartIcon size={22} />
        </span>
        <h2 className="mt-4 text-[19px] font-bold">{t.progress.emptyTitle}</h2>
        <p className="mt-2 text-[14px]">{t.progress.emptyBody}</p>
      </HeroCard>
      <ButtonLink to={startHref} block className="mt-3">
        {t.progress.startPractising}
      </ButtonLink>
    </>
  );
}

function ProgressDetails({ moments }: { moments: MomentProgress[] }) {
  const done = doneCount(moments);
  return (
    <>
      <HeroCard className="px-4 pt-2.5 pb-3.5">
        <p className="flex items-baseline gap-2">
          <span className="text-[40px] leading-none font-bold">{done}</span>
          <span className="text-[15px] font-bold">{t.progress.momentsDone(moments.length)}</span>
        </p>
        <SegmentedProgress
          className="mt-3"
          segments={moments.map((m) => (m.status === 'done' ? 'done' : 'idle'))}
          label={`${done} ${t.progress.momentsDone(moments.length)}`}
        />
      </HeroCard>

      <div className="mt-4 flex items-center justify-between gap-2">
        <h2 className="text-[16px] font-bold">{t.progress.grammarHeading}</h2>
        <p className="flex items-center gap-3 text-[13px] text-ink-2" aria-hidden="true">
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-ok-dot" />
            {t.progress.correct}
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-fix-dot" />
            {t.progress.toFix}
          </span>
        </p>
      </div>

      <ul className="mt-3 flex flex-col gap-3">
        {moments.map((m) => (
          <MomentRow key={m.id} moment={m} />
        ))}
      </ul>
      <p className="mt-5 text-center text-[14px] text-ink-2">{t.progress.privacy}</p>
    </>
  );
}

const MomentRow = memo(function MomentRow({ moment: m }: { moment: MomentProgress }) {
  if (m.status === 'locked') {
    return (
      <li className="flex items-center justify-between rounded-[26px] border border-dashed border-line bg-mist px-4 py-2.5">
        <span className="text-[15.5px] font-semibold text-ink-2">{m.title}</span>
        <span className="text-[13px] font-semibold text-ink-2">{t.progress.locked}</span>
      </li>
    );
  }

  if (m.status !== 'done' || !m.firstTry) {
    const label = m.status === 'in_progress' ? t.progress.inProgress(m.responsesDone, m.responsesTotal) : t.progress.notStarted;
    return (
      <li className="flex items-center justify-between gap-2 rounded-[26px] border border-line px-4 py-2.5">
        <span className="text-[15.5px] font-bold">{m.title}</span>
        <Pill tone={m.status === 'in_progress' ? 'sky' : 'mist'} className="text-[13px]">
          {label}
        </Pill>
      </li>
    );
  }

  const first = m.firstTry.filter(Boolean).length;
  const latest = m.latest?.filter(Boolean).length ?? first;
  const compared = m.timesPractised > 1 && m.latest;
  const delta = latest - first;

  return (
    <li className="rounded-[26px] border border-line px-4 pt-2.5 pb-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[15.5px] font-bold">{m.title}</h3>
          {compared && <p className="text-[13px] text-ink-2">{t.progress.practised(m.timesPractised)}</p>}
        </div>
        {compared ? (
          delta > 0 && (
            <Pill tone="ok" className="mt-1 text-[13px]">
              {t.progress.plusCorrect(delta)}
            </Pill>
          )
        ) : (
          <Pill tone="mist" className="shrink-0 text-[13px] whitespace-nowrap">
            {t.progress.redoToCompare}
          </Pill>
        )}
      </div>
      <div className="mt-1.5 space-y-1.5">
        <DotRow label={t.progress.firstTry} results={m.firstTry} highlight={!compared} />
        {compared && m.latest && <DotRow label={t.progress.latest} results={m.latest} highlight />}
      </div>
    </li>
  );
});

function DotRow({ label, results, highlight }: { label: string; results: boolean[]; highlight: boolean }) {
  const correct = results.filter(Boolean).length;
  return (
    <div className="flex items-center gap-3" role="img" aria-label={t.progress.dotsA11y(label, correct, results.length)}>
      <span className={cn('w-[72px] shrink-0 text-[14.5px]', highlight ? 'font-bold text-action' : 'text-ink')}>{label}</span>
      <span className="flex flex-1 flex-wrap gap-1">
        {/* A tally: correct lines first, then the ones to fix. */}
        {Array.from({ length: results.length }, (_, i) => (
          <span key={i} className={cn('size-[13px] rounded-full', i < correct ? 'bg-ok-dot' : 'bg-fix-dot')} />
        ))}
      </span>
      <span className={cn('text-[14.5px] font-bold', highlight ? 'text-action' : 'text-ink')}>
        {correct}/{results.length}
      </span>
    </div>
  );
}
