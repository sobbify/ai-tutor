import { t } from '@/i18n';
import { useHome, usePreferences, useProgress } from '@/hooks/queries';
import { useTabBack } from '@/hooks/useTabBack';
import type { MomentProgress } from '@/types/tutor';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { TabBar } from '@/components/layout/TabBar';
import { ButtonLink } from '@/components/ui/Button';
import { BoltIcon } from '@/components/ui/Icons';
import { Pill } from '@/components/ui/Pill';
import { MomentGlyph } from '@/features/journey/MomentGlyph';
import { MomentRow } from '@/features/journey/MomentRow';

const momentLink = (m: MomentProgress) => (m.status === 'in_progress' ? `/moments/${m.id}` : `/moments/${m.id}/learn`);

/** Practise tab: "Tell me what happened", "Rehearse now", her hardest moment and the anytime moments. */
export default function PractisePage() {
  const home = useHome();
  const progress = useProgress();
  const prefs = usePreferences();
  const back = useTabBack();
  const error = home.error ?? progress.error;

  return (
    <Screen>
      <AppHeader title={t.practise.title} onBack={back} />
      <main className="flex flex-1 flex-col px-5 pt-4 pb-6">
        {home.isPending || progress.isPending ? (
          <LoadingBlock />
        ) : error || !home.data || !progress.data ? (
          <ErrorBlock error={error} onRetry={() => void Promise.all([home.refetch(), progress.refetch()])} />
        ) : (
          <>
            <p className="text-[15px] leading-[22px] text-ink-2">{t.practise.intro}</p>

            <section aria-labelledby="story-title" className="mt-4 rounded-card bg-aqua px-4 pt-4 pb-4 shadow-card">
              <div className="flex items-start gap-3">
                <MomentGlyph icon="chat" size={52} />
                <div className="min-w-0 flex-1">
                  {home.data.storySuggested && (
                    <span className="mb-1 inline-flex rounded-[5px] bg-[#c8285e] px-2 py-0.5 text-[11px] font-extrabold tracking-[0.05em] text-white uppercase">
                      {t.home.storySuggested}
                    </span>
                  )}
                  <h2 id="story-title" className="text-[18px] leading-6 font-extrabold">
                    {t.practise.storyTitle}
                  </h2>
                  <p className="mt-1 text-[14px] leading-5 text-ink-2">{t.practise.storyBody}</p>
                </div>
              </div>
              <ButtonLink to="/story" size="md" className="mt-3.5 w-full">
                {t.practise.storyCta}
              </ButtonLink>
            </section>

            <section aria-labelledby="rehearse-title" className="mt-3 rounded-card border-2 border-action bg-surface px-4 pt-4 pb-4">
              <div className="flex items-start gap-3">
                <span className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-sky text-action" aria-hidden="true">
                  <BoltIcon size={26} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="rehearse-title" className="text-[18px] leading-6 font-extrabold">
                    {t.practise.rehearseTitle}
                  </h2>
                  <p className="mt-1 text-[14px] leading-5 text-ink-2">{t.practise.rehearseBody}</p>
                </div>
              </div>
              <ButtonLink to="/rehearse" variant="outline" size="md" className="mt-3.5 w-full">
                {t.practise.rehearseCta}
              </ButtonLink>
            </section>

            <Hardest moments={progress.data.moments} hardestId={prefs.data?.hardestMomentId ?? null} />
            <Anytime moments={progress.data.moments} />
          </>
        )}
      </main>
      <TabBar active="practise" />
    </Screen>
  );
}

function Hardest({ moments, hardestId }: { moments: MomentProgress[]; hardestId: string | null }) {
  const m = moments.find((x) => x.id === hardestId);
  if (!m || m.status === 'locked') return null;
  return (
    <section aria-labelledby="hardest" className="mt-6">
      <h2 id="hardest" className="text-[17px] font-extrabold">
        {t.practise.hardest}
      </h2>
      <div className="mt-2.5">
        <MomentRow to={momentLink(m)} icon={m.icon} title={m.title} pill={m.status === 'done' ? <Pill tone="ok">{t.home.practised}</Pill> : undefined} />
      </div>
    </section>
  );
}

function Anytime({ moments }: { moments: MomentProgress[] }) {
  const anytime = moments.filter((m) => m.kind === 'anytime').sort((a, b) => a.order - b.order);
  if (anytime.length === 0) return null;
  return (
    <section aria-labelledby="anytime" className="mt-6">
      <h2 id="anytime" className="text-[17px] font-extrabold">
        {t.home.anytime}
      </h2>
      <p className="text-[14px] text-ink-2">{t.home.anytimeIntro}</p>
      <ul className="mt-2.5 space-y-2.5">
        {anytime.map((m) => (
          <li key={m.id}>
            <MomentRow
              to={momentLink(m)}
              icon={m.icon}
              title={m.title}
              sub={t.journey.responses(m.responsesTotal)}
              pill={m.status === 'done' ? <Pill tone="ok">{t.home.practised}</Pill> : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
