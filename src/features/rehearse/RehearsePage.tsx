import { Link } from 'react-router';
import { t } from '@/i18n';
import { useProgress } from '@/hooks/queries';
import { useBack } from '@/hooks/useBack';
import type { MomentProgress } from '@/types/tutor';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { ChevronRightIcon } from '@/components/ui/Icons';
import { ICONS } from '@/features/journey/icons';
import type { StartState } from '@/features/conversation/useConversation';

/** "Rehearse now" (FR-17): any open moment, first three lines, about five minutes. */
export default function RehearsePage() {
  const { data, isPending, error, refetch } = useProgress();
  const back = useBack('/');
  const open = (data?.moments ?? []).filter((m) => m.status !== 'locked').sort((a, b) => a.order - b.order);

  return (
    <Screen>
      <AppHeader title={t.rehearse.title} onBack={back} />
      <main className="flex flex-1 flex-col px-5 pt-4 pb-8">
        <p className="text-[15px] leading-6 text-ink-2">{t.rehearse.intro}</p>
        {isPending ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} onRetry={() => void refetch()} />
        ) : (
          <>
            <Group title={t.rehearse.programme} moments={open.filter((m) => m.kind === 'programme')} />
            <Group title={t.rehearse.anytime} moments={open.filter((m) => m.kind === 'anytime')} />
          </>
        )}
      </main>
    </Screen>
  );
}

function Group({ title, moments }: { title: string; moments: MomentProgress[] }) {
  if (moments.length === 0) return null;
  return (
    <section className="mt-5">
      <h2 className="text-[16px] font-bold">{title}</h2>
      <ul className="mt-2 space-y-2.5">
        {moments.map((m) => (
          <li key={m.id}>
            <Link viewTransition
              to={`/moments/${m.id}`}
              state={{ quick: true } satisfies StartState}
              className="flex items-center gap-3 rounded-card border border-line px-4 py-3.5 hover:bg-sky/30"
            >
              <span className="text-[20px]" aria-hidden="true">
                {ICONS[m.icon]}
              </span>
              <span className="flex-1 text-[16px] font-bold">{m.title}</span>
              <ChevronRightIcon size={18} className="text-ink-2" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
