import { memo } from 'react';
import { t } from '@/i18n';
import type { Hint } from '@/types/tutor';
import { SaveLineButton } from '@/components/ui/SaveLineButton';
import { SpeakerButton } from '@/components/ui/SpeakerButton';

/** "You Could Say" (full sentence) or "You Could Start With" (starter chips). */
export const HintPanel = memo(function HintPanel({ hint, turnId }: { hint: Hint; turnId: string }) {
  if (hint.kind === 'starters') {
    return (
      <section aria-label={t.conversation.hintLabel} className="rounded-card bg-aqua px-3.5 pt-3 pb-3.5 shadow-card">
        <h2 className="text-[13.5px] font-bold">{t.conversation.youCouldStartWith}</h2>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {hint.options.map((option) => (
            <li key={option} className="rounded-xl bg-surface px-2.5 py-1.5 text-[14.5px] font-semibold">
              {option}
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section aria-label={t.conversation.hintLabel} className="rounded-card bg-aqua py-3.5 pr-3.5 pl-3.5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <h2 className="pt-2.5 text-[13.5px] font-bold">{t.conversation.youCouldSay}</h2>
        <span className="flex gap-1.5">
          <SpeakerButton text={hint.text} speechId={`hint:${turnId}`} />
          <SaveLineButton text={hint.text} />
        </span>
      </div>
      <p className="-mt-1 text-[15px] leading-[22px]">“{hint.text}”</p>
    </section>
  );
});
