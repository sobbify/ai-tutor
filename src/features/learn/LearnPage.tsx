import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { t } from '@/i18n';
import { useMoment } from '@/hooks/queries';
import { useBack } from '@/hooks/useBack';
import { useLocationState } from '@/hooks/useLocationState';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen, ScreenFooter } from '@/components/layout/Screen';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { Button } from '@/components/ui/Button';
import { HeroCard } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { SaveLineButton } from '@/components/ui/SaveLineButton';
import { SpeakerButton } from '@/components/ui/SpeakerButton';
import { lookFor } from '@/features/conversation/portraitLook';
import { preloadAvatar } from '@/features/conversation/preloadAvatar';
import type { StartState } from '@/features/conversation/useConversation';

/** The "Hear → Learn" steps before the role-play (FR-8, FR-12): key phrases to hear and save, one tip. */
export default function LearnPage() {
  const { momentId = '' } = useParams();
  const moment = useMoment(momentId);
  const quick = useLocationState<StartState>()?.quick === true;
  const navigate = useNavigate();
  const back = useBack('/');
  const character = moment.data?.character;
  // While she reads the phrases, fetch the 3D parent so the role-play opens with it ready.
  useEffect(() => {
    const kind = character ? lookFor(character).kind : 'coach';
    if (kind !== 'coach') preloadAvatar(kind === 'man');
  }, [character]);
  const start = () => void navigate(`/moments/${momentId}`, { replace: true, state: quick ? ({ quick: true } satisfies StartState) : undefined });

  if (moment.data && !moment.data.lesson) return <Navigate to={`/moments/${momentId}`} replace state={quick ? { quick: true } : undefined} />;

  return (
    <Screen>
      <AppHeader title={moment.data?.title ?? ''} onBack={back} />
      {moment.isPending ? (
        <LoadingBlock />
      ) : moment.error || !moment.data?.lesson ? (
        <ErrorBlock error={moment.error} onRetry={() => void moment.refetch()} />
      ) : (
        <>
          <main className="flex flex-1 flex-col px-5 pt-4 pb-6">
            <HeroCard className="px-[18px] pt-3.5 pb-4">
              <Pill className="text-[12px]">{t.learn.step}</Pill>
              <h2 className="mt-2 text-[20px] leading-7 font-bold">{moment.data.lesson.title}</h2>
              {moment.data.lesson.intro && <p className="mt-1 text-[15px] leading-6 text-ink-2">{moment.data.lesson.intro}</p>}
              <p className="mt-2 text-[13.5px] text-ink-2">{moment.data.scene}</p>
            </HeroCard>

            <h3 className="mt-5 text-[16px] font-bold">{t.learn.keyPhrases}</h3>
            <ul className="mt-2 space-y-2.5">
              {moment.data.lesson.phrases.map((p, i) => (
                <li key={p.text} className="flex items-center gap-3 rounded-card border border-line px-4 py-3">
                  <div className="min-w-0 flex-1">
                    {p.note && <p className="text-[12.5px] font-bold tracking-wide text-action uppercase">{p.note}</p>}
                    <p className="text-[16px] leading-6 font-semibold">“{p.text}”</p>
                  </div>
                  <SpeakerButton text={p.text} speechId={`lesson:${momentId}:${i}`} />
                  <SaveLineButton text={p.text} momentId={momentId} />
                </li>
              ))}
            </ul>

            {moment.data.lesson.tip && (
              <aside className="mt-4 rounded-card bg-mist px-4 py-3">
                <h3 className="text-[14px] font-bold text-action">{t.learn.tip}</h3>
                <p className="mt-0.5 text-[15px] leading-6">{moment.data.lesson.tip}</p>
              </aside>
            )}
            {quick && <p className="mt-4 text-center text-[13.5px] text-ink-2">{t.learn.quickNote}</p>}
          </main>
          <ScreenFooter className="border-t border-line">
            <Button block onClick={start}>
              {quick ? t.learn.startQuick : t.learn.start}
            </Button>
          </ScreenFooter>
        </>
      )}
    </Screen>
  );
}
