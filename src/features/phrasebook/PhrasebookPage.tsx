import { useEffect, useState } from 'react';
import { apiMode } from '@/api/client';
import { audioUrls } from '@/api/httpApi';
import { t } from '@/i18n';
import { useDeletePhrase, usePhrasebook } from '@/hooks/queries';
import { useTabBack } from '@/hooks/useTabBack';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { TabBar } from '@/components/layout/TabBar';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { HeroCard } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';
import { BookIcon, BookmarkIcon, TrashIcon } from '@/components/ui/Icons';
import { SpeakerButton } from '@/components/ui/SpeakerButton';

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/** Her saved lines (FR-22). The service worker keeps this list and each line's audio for offline use. */
export default function PhrasebookPage() {
  const { data, isPending, error, refetch } = usePhrasebook();
  const remove = useDeletePhrase();
  const back = useTabBack();
  const online = useOnline();

  // While online, fetch each line's audio once so the service worker has it for offline use.
  useEffect(() => {
    if (!online || apiMode !== 'http' || !data || !('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return;
    for (const p of data) void fetch(audioUrls.phraseVoice(p.id), { credentials: 'same-origin' }).catch(() => undefined);
  }, [data, online]);

  return (
    <Screen>
      <AppHeader title={t.phrasebook.title} onBack={back} />
      <main className="flex flex-1 flex-col px-5 pt-4 pb-8">
        <p className="text-[15px] leading-6 text-ink-2">{t.phrasebook.intro}</p>
        {!online && (
          <p role="status" className="mt-3 rounded-card bg-mist px-4 py-2.5 text-[14px] font-semibold">
            {t.phrasebook.offline}
          </p>
        )}
        {isPending ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock error={error} onRetry={() => void refetch()} />
        ) : data.length === 0 ? (
          <HeroCard className="mt-4 flex flex-col items-center px-6 pt-6 pb-7 text-center">
            <span className="relative flex size-16 items-center justify-center rounded-full bg-surface text-action shadow-soft" aria-hidden="true">
              <BookIcon size={28} />
              <span className="absolute -top-1 -right-1 flex size-7 items-center justify-center rounded-full bg-action text-on-action">
                <BookmarkIcon size={14} />
              </span>
            </span>
            <h2 className="mt-4 text-[18px] font-bold">{t.phrasebook.emptyTitle}</h2>
            <p className="mt-1.5 text-[14.5px] leading-[22px] text-ink-2">{t.phrasebook.empty}</p>
            <ButtonLink to="/practise" size="md" className="mt-4">
              {t.phrasebook.emptyCta}
            </ButtonLink>
          </HeroCard>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {data.map((p) => (
              <li key={p.id} className="flex animate-rise items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
                <p className="min-w-0 flex-1 text-[16px] leading-6 font-semibold">“{p.text}”</p>
                <SpeakerButton text={p.text} speechId={`phrase:${p.id}`} src={apiMode === 'http' ? audioUrls.phraseVoice(p.id) : undefined} />
                <button
                  type="button"
                  onClick={() => remove.mutate(p.id)}
                  disabled={!online || remove.isPending}
                  aria-label={t.phrasebook.remove(p.text)}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-mist disabled:opacity-40"
                >
                  <TrashIcon size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
      <TabBar active="phrasebook" />
    </Screen>
  );
}
