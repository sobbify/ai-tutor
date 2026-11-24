import { useParams } from 'react-router';
import { t } from '@/i18n';
import { useMoment, useRun } from '@/hooks/queries';
import { useBack } from '@/hooks/useBack';
import { useLocationState } from '@/hooks/useLocationState';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen, ScreenFooter } from '@/components/layout/Screen';
import { ErrorBlock, LoadingBlock } from '@/components/layout/StatusScreens';
import { ButtonLink } from '@/components/ui/Button';
import { ParentBubble, UserBubble } from '@/features/conversation/ChatBubbles';
import type { JustFinishedState } from '@/features/conversation/useConversation';

/** Screen 11: the whole conversation after the last line, then on to the summary. */
export default function ChatPage() {
  const { momentId = '' } = useParams();
  const moment = useMoment(momentId);
  const run = useRun(momentId);
  const justFinished = useLocationState<JustFinishedState>()?.justFinished === true;
  const back = useBack(`/moments/${momentId}/summary`);

  const title = moment.data?.title ?? '';
  const error = moment.error ?? run.error;

  return (
    <Screen>
      <AppHeader title={title} onBack={back} />
      {moment.isPending || run.isPending ? (
        <LoadingBlock />
      ) : error || !moment.data ? (
        <ErrorBlock error={error} onRetry={() => void Promise.all([moment.refetch(), run.refetch()])} />
      ) : (
        <>
          <main className="flex-1 bg-mist pb-6">
            <h2 className="border-b border-line bg-surface px-5 py-3.5 text-[14.5px] font-bold">{t.chat.title(moment.data.character.name)}</h2>
            <div className="px-4 pt-4">
            <p className="mx-4 rounded-[26px] border border-line bg-surface px-5 py-2.5 text-center text-[13.5px] leading-5 text-ink-2">
              <b className="font-bold text-ink">{t.chat.scene}</b> {moment.data.scene}
            </p>
            <ol className="mt-5 flex flex-col gap-3">
              {(run.data ? moment.data.turns.filter((x) => run.data?.turnIds.includes(x.id)) : moment.data.turns).map((turn) => {
                const reply = run.data?.replies.find((r) => r.turnId === turn.id);
                return [
                  <ParentBubble key={`${turn.id}-p`} character={moment.data.character} text={turn.parentLine} speechId={`final:${turn.id}`} showSpeaker={false} />,
                  reply ? <UserBubble key={`${turn.id}-r`} reply={reply} /> : null,
                ];
              })}
            </ol>
            </div>
          </main>
          <ScreenFooter className="border-t border-line">
            <ButtonLink to={`/moments/${momentId}/summary`} state={justFinished ? { justFinished: true } : undefined} replace={justFinished} block>
              {t.chat.seeSummary}
            </ButtonLink>
          </ScreenFooter>
        </>
      )}
    </Screen>
  );
}
