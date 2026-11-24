import { Link, Navigate } from 'react-router';
import { t } from '@/i18n';
import { useHome, useProgress } from '@/hooks/queries';
import { exitTutor } from '@/hooks/useBack';
import type { Home, MomentProgress } from '@/types/tutor';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { TabBar } from '@/components/layout/TabBar';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { ButtonLink } from '@/components/ui/Button';
import { HeroCard } from '@/components/ui/Card';
import { ChevronRightIcon, FlameIcon, LockIcon } from '@/components/ui/Icons';
import { Pill } from '@/components/ui/Pill';
import { SegmentedProgress, type SegmentState } from '@/components/ui/Progress';
import { MomentGlyph } from './MomentGlyph';
import { ProgrammePath } from './ProgrammePath';

/** Home tab: today's programme day, her moment for today and the 3-week map (02 / 14). */
export default function JourneyPage() {
  const home = useHome();
  const progress = useProgress();
  const error = home.error ?? progress.error;

  if (home.data && !home.data.consented) return <Navigate to="/welcome" replace />;

  return (
    <Screen>
      <AppHeader title={t.journey.title} onBack={exitTutor} />
      <main className="flex flex-1 flex-col pb-6">
        {home.isPending || progress.isPending ? (
          <LoadingBlock />
        ) : error || !home.data || !progress.data ? (
          <ErrorBlock error={error} onRetry={() => void Promise.all([home.refetch(), progress.refetch()])} />
        ) : (
          <HomeContent home={home.data} moments={progress.data.moments} />
        )}
      </main>
      <TabBar active="home" />
    </Screen>
  );
}

function daySegments(home: Home): SegmentState[] {
  const { programme: p } = home;
  return Array.from({ length: p.totalDays }, (_, i) => (i < p.daysPractised ? 'done' : i === p.daysPractised ? 'current' : 'idle'));
}

function HomeContent({ home, moments }: { home: Home; moments: MomentProgress[] }) {
  const p = home.programme;
  const dayLabel = `${t.home.dayOf(p.day, p.totalDays)} · ${t.home.week(p.week, p.weekTitle)}`;

  return (
    <>
      <HeroCard aria-labelledby="home-greeting" className="mx-5 mt-4 px-[18px] pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <h2 id="home-greeting" className="text-[19px] leading-7 font-bold">
            {t.journey.greeting(home.learner.firstName)}
          </h2>
          {home.streak.days > 0 && (
            <Pill tone="gold" className="mt-0.5 text-[13px]">
              <FlameIcon size={14} />
              <span className="sr-only">{t.home.streakA11y(home.streak.days)}</span>
              <span aria-hidden="true">{home.streak.days}</span>
            </Pill>
          )}
        </div>
        <p className="mt-1 text-[14px] leading-5 font-semibold text-ink">{dayLabel}</p>
        <SegmentedProgress className="mt-3" segments={daySegments(home)} label={dayLabel} />
        <div className="mt-3.5 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-sage">
            <LockIcon size={15} />
            {t.journey.privacy}
          </p>
          <ButtonLink to="/progress" size="sm" className="h-9 shrink-0 gap-1 px-3 text-[14px]">
            {t.journey.seeProgress}
            <ChevronRightIcon size={15} />
          </ButtonLink>
        </div>
      </HeroCard>

      <div className="mx-5 mt-3 space-y-3">
        {!home.baselineDone && (
          <TodayCard label={t.welcome.baselineTitle} title={t.home.baselineCard} to="/moments/hello-elsa" action={t.welcome.startChat} />
        )}
        {p.complete ? (
          <TodayCard label={t.home.today} title={t.home.programmeDone} to="/certificate" action={t.home.seeCertificate} />
        ) : (
          home.recommended && (
            <TodayCard
              label={`${t.home.today} · ${t.home.reasons[home.recommended.reason]}`}
              title={home.recommended.title}
              to={home.recommended.reason === 'continue' ? `/moments/${home.recommended.momentId}` : `/moments/${home.recommended.momentId}/learn`}
              action={home.recommended.reason === 'continue' ? t.home.continueToday : t.home.startToday}
            />
          )
        )}
      </div>

      {home.storySuggested && (
        <Link
          viewTransition
          to="/story"
          className="mx-5 mt-3 flex items-center gap-3 rounded-card bg-aqua px-4 py-3 hover:brightness-[0.98]"
        >
          <MomentGlyph icon="chat" size={40} />
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-bold tracking-wide text-action uppercase">{t.home.storySuggested}</span>
            <span className="block text-[15.5px] font-bold">{t.home.story}</span>
          </span>
          <ChevronRightIcon size={18} className="text-ink-2" />
        </Link>
      )}

      <h2 className="mx-5 mt-6 text-[17px] font-extrabold">{t.home.programmeHeading}</h2>
      <ProgrammePath moments={moments} daysPractised={p.daysPractised} />

    </>
  );
}

function TodayCard({ label, title, to, action }: { label: string; title: string; to: string; action: string }) {
  // The link names its destination too ("Start Morning Greeting…"), not just "Start".
  return (
    <section className="flex items-center gap-3 rounded-card border-2 border-action bg-surface px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-bold tracking-wide text-action uppercase">{label}</p>
        <p className="mt-0.5 text-[16.5px] leading-6 font-bold">{title}</p>
      </div>
      <ButtonLink to={to} size="md" className="shrink-0 px-4" aria-label={`${action} ${title}`}>
        {action}
        <span className="sr-only">{` ${title}`}</span>
      </ButtonLink>
    </section>
  );
}
