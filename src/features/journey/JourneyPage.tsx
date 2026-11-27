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
import { ChevronRightIcon, FlameIcon, LockIcon, UsersIcon } from '@/components/ui/Icons';
import { Snowflake } from '@/components/ui/Snowflake';
import { Pill } from '@/components/ui/Pill';
import { SegmentedProgress, type SegmentState } from '@/components/ui/Progress';
import { MomentGlyph } from './MomentGlyph';
import { ProgrammePath } from './ProgrammePath';
import { buildLectures, type Lecture } from './path';

/** Home tab: her lectures so far, anything ELSA suggests, and the lecture path (02 / 14). */
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

/** One segment per lecture: done, the one she is on, or still to come. */
function lectureSegments(lectures: Lecture[]): SegmentState[] {
  return lectures.map((l) => (l.state === 'done' ? 'done' : l.state === 'active' ? 'current' : 'idle'));
}

function HomeContent({ home, moments }: { home: Home; moments: MomentProgress[] }) {
  const p = home.programme;
  const lectures = buildLectures(moments);
  const done = lectures.filter((l) => l.state === 'done').length;
  const countLabel = t.lecture.doneCount(done, lectures.length);
  // The lecture she is on is opened up on the path below, so a "Today" card for it would only
  // repeat it. Keep the card for anything else ELSA suggests (say, her hardest moment first).
  const active = lectures.find((l) => l.state === 'active');
  const suggestion = home.recommended && home.recommended.momentId !== active?.moment.id ? home.recommended : null;

  return (
    <>
      <HeroCard aria-labelledby="home-greeting" className="mx-5 mt-4 px-[18px] pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <h2 id="home-greeting" className="text-[19px] leading-7 font-bold">
            {t.journey.greeting(home.learner.firstName)}
          </h2>
          <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
            {home.streak.days > 0 && (
              <Pill tone="gold" className="text-[13px]">
                <FlameIcon size={14} />
                <span className="sr-only">{t.home.streakA11y(home.streak.days)}</span>
                <span aria-hidden="true">{home.streak.days}</span>
              </Pill>
            )}
            <Link viewTransition to="/me" className="rounded-full" aria-label={t.snowflakes.weekLabel(home.snowflakes.week)}>
              <Pill tone="sky" className="gap-1 py-px pl-1.5 text-[13px]">
                <Snowflake size={16} />
                <span aria-hidden="true">{home.snowflakes.week}</span>
              </Pill>
            </Link>
          </span>
        </div>
        <SegmentedProgress className="mt-3" segments={lectureSegments(lectures)} label={countLabel} />
        <p className="mt-2 text-[14px] leading-5 font-bold text-ink">{countLabel}</p>
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
          suggestion && (
            <TodayCard
              label={`${t.home.today} · ${t.home.reasons[suggestion.reason]}`}
              title={suggestion.title}
              to={suggestion.reason === 'continue' ? `/moments/${suggestion.momentId}` : `/moments/${suggestion.momentId}/learn`}
              action={suggestion.reason === 'continue' ? t.home.continueToday : t.home.startToday}
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

      {home.group ? (
        <Link
          viewTransition
          to="/group"
          className="mx-5 mt-3 flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card hover:bg-sky/20"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sky text-action" aria-hidden="true">
            <UsersIcon size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 block text-[15.5px] leading-[21px] font-bold break-words">{t.group.homeTitle(home.group.name)}</span>
            <span className="block text-[13px] font-semibold text-ink-2">{t.group.homeSub(home.group.weekTotal, home.group.weekGoal)}</span>
            <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-action"
                style={{ width: `${home.group.weekGoal ? Math.min(100, (home.group.weekTotal / home.group.weekGoal) * 100) : 0}%` }}
              />
            </span>
          </span>
          <ChevronRightIcon size={18} className="text-ink-2" />
        </Link>
      ) : (
        home.groupInvite && (
          <section className="mx-5 mt-3 flex items-center gap-3 rounded-card bg-aqua px-4 py-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-action" aria-hidden="true">
              <UsersIcon size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15.5px] leading-6 font-bold">{t.group.inviteCardTitle}</p>
              <p className="text-[13px] leading-[18px] text-ink-2">{t.group.inviteCardText}</p>
            </div>
            <ButtonLink to="/group" size="sm" className="h-9 shrink-0 px-3 text-[14px]">
              {t.group.inviteCardCta}
            </ButtonLink>
          </section>
        )
      )}

      <h2 className="mx-5 mt-6 text-[18px] font-extrabold">{t.lecture.heading}</h2>
      <ProgrammePath moments={moments} />

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
