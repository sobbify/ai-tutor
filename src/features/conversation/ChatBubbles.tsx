import { memo } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import type { Character, Reply } from '@/types/tutor';
import { CheckIcon, PencilIcon } from '@/components/ui/Icons';
import { SaveLineButton } from '@/components/ui/SaveLineButton';
import { SpeakerButton } from '@/components/ui/SpeakerButton';
import { Face } from './Portrait';

/** Underlines the first occurrence of `phrase` (the grammar slip) inside `text`. */
export function HighlightedText({ text, phrase }: { text: string; phrase: string | null | undefined }) {
  if (!phrase) return <>{text}</>;
  const at = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <u className="decoration-[1.5px] underline-offset-[3px]">{text.slice(at, at + phrase.length)}</u>
      {text.slice(at + phrase.length)}
    </>
  );
}

function ParentAvatar({ character }: { character: Character }) {
  return (
    <div className="flex w-[44px] shrink-0 flex-col items-center gap-0.5 self-end pb-0.5" aria-hidden="true">
      <Face character={character} className="size-9 overflow-hidden rounded-full border-2 border-surface shadow-soft" />
      <span className="text-[10.5px] font-semibold text-ink-2">{character.role || t.conversation.parent}</span>
    </div>
  );
}

export const ParentBubble = memo(function ParentBubble({
  character,
  text,
  speechId,
  showSpeaker = true,
}: {
  character: Character;
  text: string;
  speechId: string;
  showSpeaker?: boolean;
}) {
  return (
    <li className="flex items-end gap-1.5 pr-10">
      <ParentAvatar character={character} />
      <div className="flex min-w-0 flex-1 items-start gap-2 rounded-[26px] rounded-bl-md border border-line bg-surface py-3 pr-2.5 pl-3.5">
        <p className="flex-1 text-[16px] leading-6">
          <span className="sr-only">{character.name}: </span>
          {text}
        </p>
        {showSpeaker && <SpeakerButton text={text} speechId={speechId} size="sm" className="mt-0.5" />}
      </div>
    </li>
  );
});

/** A finished reply in the chat history, with its one-line verdict. */
export const UserBubble = memo(function UserBubble({ reply }: { reply: Reply }) {
  const fix = reply.feedback.fix;
  return (
    <li className="flex justify-end pl-14">
      <div className="rounded-[26px] rounded-br-md bg-sky px-3.5 pt-3 pb-3">
        <p className="text-[16px] leading-6">
          <span className="sr-only">{t.conversation.you}: </span>
          <HighlightedText text={reply.transcript} phrase={fix?.wrong} />
        </p>
        <p className={cn('mt-2.5 flex items-center gap-2 border-t border-bubble-line pt-2.5 text-[13.5px]', fix ? 'text-ink' : 'font-bold text-ok')}>
          {fix ? (
            <>
              <PencilIcon size={15} className="shrink-0 text-action" />
              <span>
                <b>{t.conversation.try}</b> “{fix.better}”
              </span>
            </>
          ) : (
            <>
              <CheckIcon size={15} className="shrink-0" />
              {t.conversation.wellSaid}
            </>
          )}
        </p>
      </div>
    </li>
  );
});

/** The just-spoken reply with full feedback (screens 07 / 08 / 09). */
export const FeedbackCard = memo(function FeedbackCard({
  reply,
  momentId,
  as: Tag = 'div',
}: {
  reply: Reply;
  momentId?: string;
  as?: 'div' | 'li';
}) {
  const { fix, positives, tip } = reply.feedback;
  return (
    <Tag className="flex justify-end pl-10">
      <article className="w-full max-w-[314px] animate-rise overflow-hidden rounded-[26px] border border-line bg-surface shadow-soft">
        <div className="bg-sky px-3.5 pt-3.5 pb-3">
          <p className="text-[16px] leading-6">
            <span className="sr-only">{t.conversation.you}: </span>
            <HighlightedText text={reply.transcript} phrase={fix?.wrong} />
          </p>
        </div>
        <div className="space-y-3 px-3 pt-3 pb-3">
          <ul className="space-y-2">
            {positives.map((p, i) => (
              <li key={p} className="flex animate-rise items-center gap-2.5 text-[14.5px] font-bold text-ok" style={{ animationDelay: `${120 + i * 110}ms` }}>
                <span className="relative flex size-[22px] shrink-0 animate-pop items-center justify-center rounded-full bg-ok-bg" style={{ animationDelay: `${160 + i * 110}ms` }}>
                  <CheckIcon size={13} strokeWidth={3} />
                  {!fix && i === positives.length - 1 && <Sparkles />}
                </span>
                {p}
              </li>
            ))}
          </ul>
          {fix && (
            <div className="animate-rise rounded-[18px] border border-line bg-mist py-3 pr-3 pl-3" style={{ animationDelay: '260ms' }}>
              <h3 className="text-[14px] font-bold text-action">{t.conversation.grammarFix}</h3>
              <p className="mt-1 text-[13.5px] text-ink-2">
                {t.conversation.insteadOf} <s>{fix.wrong}</s>, {t.conversation.say}
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <p className="text-[15.5px] leading-snug font-bold">“{fix.better}”</p>
                <span className="flex shrink-0 gap-1.5">
                  <SpeakerButton text={fix.better} speechId={`fix:${reply.turnId}:${reply.attempt}`} />
                  <SaveLineButton text={fix.better} momentId={momentId} />
                </span>
              </div>
              {tip && (
                <p className="mt-2.5 border-t border-line pt-2 text-[13.5px] leading-5 text-ink">
                  <b className="text-action">{t.conversation.tip}:</b> {tip}
                </p>
              )}
            </div>
          )}
        </div>
      </article>
    </Tag>
  );
});

/** A tiny burst for a reply with no mistakes (hidden from assistive tech; static without motion). */
function Sparkles() {
  return (
    <svg viewBox="0 0 40 40" className="pointer-events-none absolute -inset-[9px] size-10 animate-pop text-[#f2b705]" style={{ animationDelay: '420ms' }} aria-hidden="true">
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <path key={deg} d="M20 2 v5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${deg} 20 20)`} />
      ))}
    </svg>
  );
}
