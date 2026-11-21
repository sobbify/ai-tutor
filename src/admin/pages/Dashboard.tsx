import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { adminApi } from '../api';
import { adminKeys } from '../keys';
import { ActivityChart } from '../ActivityChart';
import { ErrorBox, Loading, PageHeader, Panel, StatTile } from '../ui';
import { fmtNumber } from '../format';

export default function Dashboard() {
  const stats = useQuery({ queryKey: adminKeys.stats, queryFn: adminApi.stats, refetchInterval: 60_000 });
  if (stats.isPending) return <Loading />;
  if (stats.error) return <ErrorBox error={stats.error} onRetry={() => void stats.refetch()} />;
  const { kpis, activity, moments, topFixes } = stats.data;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="How teachers are practising, at a glance. Refreshes every minute." />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="Learners" value={fmtNumber(kpis.learners)} hint={`${fmtNumber(kpis.activeLearnersWeek)} active this week`} />
        <StatTile label="Signed in now" value={fmtNumber(kpis.signedInNow)} hint="Learners with a live session" />
        <StatTile label="Replies" value={fmtNumber(kpis.repliesTotal)} hint={`${fmtNumber(kpis.repliesWeek)} this week`} />
        <StatTile
          label="First-try grammar"
          value={kpis.accuracyMonth === null ? '—' : `${kpis.accuracyMonth}%`}
          hint={`Last 30 days · ${fmtNumber(kpis.completedRuns)} moments finished`}
        />
      </div>

      <Panel title="Replies per day" className="mt-6" actions={kpis.avgEvalMs !== null && <span className="text-[13px] text-ink-2">Avg. check time {fmtNumber(kpis.avgEvalMs)} ms</span>}>
        <ActivityChart data={activity} />
      </Panel>

      <div className="mt-6 grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Panel title="Moments">
          <ul className="flex flex-col gap-4">
            {moments.map((m) => {
              const rate = m.learnersStarted ? Math.round((100 * m.completions) / Math.max(m.learnersStarted, m.completions)) : 0;
              return (
                <li key={m.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <Link to={`/admin/content/${m.id}`} className="font-bold hover:underline">
                      {m.title}
                    </Link>
                    <span className="text-[13px] whitespace-nowrap text-ink-2">
                      {fmtNumber(m.learnersStarted)} started · {fmtNumber(m.completions)} finished · {m.accuracy === null ? '—' : `${m.accuracy}% correct`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-mist" role="img" aria-label={`${rate}% of starters finished`}>
                    <div className="h-full rounded-full bg-action" style={{ width: `${rate}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="Most common fixes" actions={<Link to="/admin/replies?outcome=fix" className="text-[13.5px] font-bold text-action hover:underline">See all</Link>}>
          {topFixes.length === 0 ? (
            <p className="text-[14px] text-ink-2">No grammar fixes yet.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {topFixes.map((f) => (
                <li key={`${f.wrong}|${f.better}`} className="flex items-start justify-between gap-3 rounded-2xl bg-mist px-3.5 py-2.5">
                  <div className="min-w-0 text-[14px]">
                    <p className="text-ink-2">
                      <s>{f.wrong}</s>
                    </p>
                    <p className="font-bold">“{f.better}”</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[12.5px] font-bold tabular-nums">×{fmtNumber(f.count)}</span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}
