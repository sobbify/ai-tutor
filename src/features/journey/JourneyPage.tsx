import type { ReactNode } from 'react';
import { Link, Navigate } from 'react-router';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { useHome, useProgress } from '@/hooks/queries';
import { exitTutor } from '@/hooks/useBack';
import type { Home, MomentProgress } from '@/types/tutor';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { ButtonLink } from '@/components/ui/Button';
import { HeroCard } from '@/components/ui/Card';
import { AwardIcon, BoltIcon, BookIcon, ChatBubbleIcon, ChevronRightIcon, FlameIcon, LockIcon, SettingsIcon } from '@/components/ui/Icons';
import { Pill } from '@/components/ui/Pill';
import { SegmentedProgress, type SegmentState } from '@/components/ui/Progress';
import { ICONS } from './icons';
import { JourneyMap } from './JourneyMap';

/** Home: today's programme day, her moment for today, quick actions and the 3-week map (02 / 14). */
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
    </Screen>
  );
}

function daySegments(home: Home): SegmentState[] {
  const { programme: p } = home;
  return Array.from({ length: p.totalDays }, (_, i) => (i < p.daysPractised ? 'done' : i === p.daysPractised ? 'current' : 'idle'));
}

function HomeContent({ home, moments }: { home: Home; moments: MomentProgress[] }) {
  const programme = moments.filter((m) => m.kind === 'programme').sort((a, b) => a.order - b.order);
  const anytime = moments.filter((m) => m.kind === 'anytime').sort((a, b) => a.order - b.order);
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
          <TodayCard label={t.welcome.baselineTitle} title={t.welcome.baselineBody} to="/moments/hello-elsa" action={t.welcome.startChat} />
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

      <nav aria-label={t.home.programmeHeading} className="mx-5 mt-3 grid grid-cols-2 gap-3">
        <Action to="/rehearse" icon={<BoltIcon size={20} />} title={t.home.rehearseNow} sub={t.home.rehearseNowSub} />
        <Action
          to="/story"
          icon={<ChatBubbleIcon size={20} />}
          title={t.home.story}
          sub={home.storySuggested ? t.home.storySuggested : t.home.storySub}
          highlight={home.storySuggested}
        />
        <Action to="/phrasebook" icon={<BookIcon size={20} />} title={t.home.phrasebook} sub={t.home.phrasebookSub} />
        <Action to="/certificate" icon={<AwardIcon size={20} />} title={t.certificate.title} sub={home.certificateEarned ? t.certificate.share : t.certificate.notYet} />
      </nav>

      <h2 className="mx-5 mt-6 text-[17px] font-bold">{t.home.programmeHeading}</h2>
      <JourneyMap moments={programme} />

      {anytime.length > 0 && (
        <section aria-labelledby="anytime" className="mx-5 mt-2">
          <h2 id="anytime" className="text-[17px] font-bold">
            {t.home.anytime}
          </h2>
          <p className="text-[14px] text-ink-2">{t.home.anytimeIntro}</p>
          <ul className="mt-3 space-y-2.5">
            {anytime.map((m) => (
              <li key={m.id}>
                <Link viewTransition
                  to={m.status === 'in_progress' ? `/moments/${m.id}` : `/moments/${m.id}/learn`}
                  className="flex items-center gap-3 rounded-card border border-line px-4 py-3 hover:bg-sky/30"
                >
                  <span className="text-[20px]" aria-hidden="true">
                    {ICONS[m.icon]}
                  </span>
                  <span className="flex-1 text-[16px] font-bold">{m.title}</span>
                  {m.status === 'done' && <Pill tone="ok">{t.home.practised}</Pill>}
                  <ChevronRightIcon size={18} className="text-ink-2" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link viewTransition to="/settings" className="mx-5 mt-6 flex items-center gap-2 self-start py-2 text-[15px] font-bold text-action hover:underline">
        <SettingsIcon size={18} />
        {t.home.settings}
      </Link>
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

function Action({ to, icon, title, sub, highlight }: { to: string; icon: ReactNode; title: string; sub: string; highlight?: boolean }) {
  return (
    <Link viewTransition
      to={to}
      className={cn(
        'flex flex-col gap-1 rounded-card border px-3.5 py-3 hover:bg-sky/30',
        highlight ? 'border-2 border-action bg-aqua' : 'border-line bg-surface',
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-full bg-sky text-action" aria-hidden="true">
        {icon}
      </span>
      <span className="text-[15px] leading-5 font-bold">{title}</span>
      <span className={cn('text-[13px] leading-4', highlight ? 'font-bold text-action' : 'text-ink-2')}>{sub}</span>
    </Link>
  );
}
