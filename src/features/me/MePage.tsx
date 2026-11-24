import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { useCertificate, useHome, usePhrasebook, useProgress } from '@/hooks/queries';
import { useTabBack } from '@/hooks/useTabBack';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { TabBar } from '@/components/layout/TabBar';
import { AwardIcon, ChartIcon, ChevronRightIcon, FlameIcon, LockIcon, SettingsIcon, UsersIcon } from '@/components/ui/Icons';
import { Snowflake } from '@/components/ui/Snowflake';

/** Me tab: her name and streak, a few numbers, and the way to progress, certificate and settings. */
export default function MePage() {
  const home = useHome();
  const progress = useProgress();
  const certificate = useCertificate();
  const phrases = usePhrasebook();
  const back = useTabBack();
  const error = home.error ?? progress.error;

  return (
    <Screen>
      <AppHeader title={t.me.title} onBack={back} />
      <main className="flex flex-1 flex-col px-5 pt-4 pb-6">
        {home.isPending || progress.isPending ? (
          <LoadingBlock />
        ) : error || !home.data || !progress.data ? (
          <ErrorBlock error={error} onRetry={() => void Promise.all([home.refetch(), progress.refetch()])} />
        ) : (
          <>
            <section aria-labelledby="me-name" className="flex items-center gap-4 rounded-card bg-aqua px-4 py-4 shadow-card">
              <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-header text-[28px] font-extrabold text-white shadow-soft" aria-hidden="true">
                {home.data.learner.firstName.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h2 id="me-name" className="truncate text-[21px] leading-7 font-extrabold">
                  {home.data.learner.firstName}
                </h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-[14px] font-semibold text-ink-2">
                  {home.data.streak.days > 0 ? (
                    <>
                      <FlameIcon size={16} className="text-[#e8890c]" />
                      {t.me.streak(home.data.streak.days)}
                    </>
                  ) : (
                    t.me.noStreak
                  )}
                </p>
              </div>
            </section>

            <dl className="mt-3 grid grid-cols-2 gap-2.5">
              <Stat
                label={t.me.snowflakes}
                value={`${home.data.snowflakes.total}`}
                icon={<Snowflake size={22} />}
                sub={t.snowflakes.thisWeek(home.data.snowflakes.week)}
              />
              <Stat label={t.me.daysPractised} value={`${home.data.programme.daysPractised}`} />
              <Stat
                label={t.me.momentsDone}
                value={`${progress.data.moments.filter((m) => m.kind !== 'baseline' && m.status === 'done').length}`}
              />
              <Stat label={t.me.linesSaved} value={phrases.data ? `${phrases.data.length}` : '–'} />
            </dl>

            <p className="mt-2 px-1 text-center text-[12.5px] leading-[18px] text-ink-2">{t.snowflakes.how}</p>

            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              <Row
                to="/group"
                icon={<UsersIcon size={20} />}
                well="bg-aqua text-action"
                title={t.group.title}
                sub={home.data.group ? t.group.rowSub(home.data.group.name, home.data.group.members) : t.group.rowNone}
              />
              <Row to="/progress" icon={<ChartIcon size={20} />} well="bg-sky text-action" title={t.progress.title} sub={t.me.progressSub} />
              <Row
                to="/certificate"
                icon={<AwardIcon size={20} />}
                well="bg-gold text-gold-ink"
                title={t.certificate.title}
                sub={
                  certificate.data?.earned
                    ? t.me.certificateEarned
                    : certificate.data && certificate.data.daysNeeded > 0
                      ? t.me.certificateLeft(certificate.data.daysNeeded)
                      : t.me.certificateMoments
                }
              />
              <Row to="/settings" icon={<SettingsIcon size={20} />} well="bg-mist text-ink" title={t.settings.title} sub={t.me.settingsSub} />
            </ul>

            <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[13px] font-semibold text-sage">
              <LockIcon size={14} />
              {t.me.privacy}
            </p>
          </>
        )}
      </main>
      <TabBar active="me" />
    </Screen>
  );
}

function Stat({ label, value, icon, sub }: { label: string; value: string; icon?: ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col-reverse items-center rounded-card border border-line bg-surface px-2 py-3 text-center">
      <dt className="text-[12px] leading-4 font-semibold text-ink-2">
        {label}
        {sub && <span className="block font-bold text-action">{sub}</span>}
      </dt>
      <dd className="flex items-center gap-1 text-[24px] leading-8 font-extrabold text-action">
        {icon}
        {value}
      </dd>
    </div>
  );
}

function Row({ to, icon, well, title, sub }: { to: string; icon: ReactNode; well: string; title: string; sub: string }) {
  return (
    <li>
      <Link viewTransition to={to} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-sky/25 active:bg-sky/40">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', well)} aria-hidden="true">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] leading-6 font-bold">{title}</span>
          <span className="block text-[13px] leading-[18px] text-ink-2">{sub}</span>
        </span>
        <ChevronRightIcon size={18} className="shrink-0 text-ink-2" />
      </Link>
    </li>
  );
}
