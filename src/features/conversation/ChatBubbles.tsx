import { memo, type ReactNode } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { closestSentence, closestSpan, diffWords } from '@/lib/wordDiff';
import { groupSlips, slipsOf, type SlipView } from '@/lib/slips';
import type { Character, GrammarFix, Reply } from '@/types/tutor';
import { CheckIcon } from '@/components/ui/Icons';
import { SaveLineButton } from '@/components/ui/SaveLineButton';
import { SpeakerButton } from '@/components/ui/SpeakerButton';
import { Face } from './Portrait';

/** The slip inside her words: red, wavy-underlined, on a soft red wash (the colour isn't the only cue). */
const SLIP = 'rounded-[4px] bg-danger-wash px-0.5 text-danger-ink underline decoration-wavy decoration-[1.5px] underline-offset-[4px]';

/** Marks the first occurrence of each slip (`phrase`, or every one in `phrases`) inside `text`. */
export function HighlightedText({ text, phrase, phrases }: { text: string; phrase?: string | null; phrases?: string[] }) {
  const wanted = (phrases ?? (phrase ? [phrase] : [])).filter(Boolean);
  // Find each slip's first match, then keep the ones that don't overlap, left to right.
  const spans = wanted
    .map((p) => ({ at: text.toLowerCase().indexOf(p.toLowerCase()), len: p.length }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .filter((x, i, all) => i === 0 || x.at >= (all[i - 1]?.at ?? 0) + (all[i - 1]?.len ?? 0));
  if (!spans.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let from = 0;
  spans.forEach(({ at, len }, i) => {
    out.push(text.slice(from, at));
    out.push(
      <mark key={i} className={SLIP}>
        <span className="sr-only">(mistake: </span>
        {text.slice(at, at + len)}
        <span className="sr-only">)</span>
      </mark>,
    );
    from = at + len;
  });
  out.push(text.slice(from));
  return <>{out}</>;
}

/**
 * Every slip in a reply, sorted into its category (Tense, A / an / the, …): one "You said → Try"
 * per slip, each changing one thing, then the whole reply with every fix when there are several.
 * `actions` adds buttons (listen, save) beside a corrected line.
 */
export function SlipList({
  transcript,
  slips,
  corrected,
  compact = false,
  actions,
}: {
  transcript: string;
  slips: SlipView[];
  corrected?: string | null;
  compact?: boolean;
  actions?: (text: string, key: string) => ReactNode;
}) {
  if (slips.length === 0) return null;
  if (slips.length === 1 && slips[0]) {
    const only = slips[0];
    return (
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <SaidTry transcript={transcript} fix={only} tip={only.tip} compact={compact} />
        </div>
        {actions?.(only.better, 'slip-0')}
      </div>
    );
  }
  let n = 0;
  return (
    <div className={cn('flex flex-col', compact ? 'gap-2.5' : 'gap-3')}>
      {groupSlips(slips).map((group) => (
        <section key={group.category} aria-label={t.conversation.categories[group.category] ?? group.category} className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5">
            <CategoryBadge category={group.category} />
            {group.slips.length > 1 && <span className="text-[12px] font-extrabold text-ink-2">× {group.slips.length}</span>}
          </p>
          {group.slips.map((slip) => {
            const key = `slip-${n++}`;
            return (
              <div key={key} className="flex items-start gap-2 border-l-[3px] border-[#c8285e]/40 pl-2.5">
                <div className="min-w-0 flex-1">
                  <SaidTry transcript={transcript} fix={slip} tip={slip.tip} compact />
                </div>
                {actions?.(slip.better, key)}
              </div>
            );
          })}
        </section>
      ))}
      {corrected && (
        <div className="rounded-[14px] border-2 border-ok-dot/60 bg-ok-bg/60 px-3 py-2">
          <p className="text-[11.5px] font-extrabold tracking-wide text-ok uppercase">{t.conversation.allTogether}</p>
          <div className="mt-0.5 flex items-start gap-2">
            <p className={cn('min-w-0 flex-1 leading-snug font-bold text-ink', compact ? 'text-[15px]' : 'text-[16.5px]')}>{corrected}</p>
            {actions?.(corrected, 'together')}
          </div>
        </div>
      )}
    </div>
  );
}

/** Small pink label naming the kind of slip (Tense, A / an / the, …). */
export function CategoryBadge({ category, className }: { category: string | null | undefined; className?: string }) {
  const label = t.conversation.categories[category ?? 'grammar'] ?? t.conversation.categories.grammar;
  return (
    <span className={cn('inline-flex items-center rounded-[5px] bg-[#c8285e] px-2 py-0.5 text-[11px] font-extrabold tracking-[0.05em] text-white uppercase', className)}>
      {label}
    </span>
  );
}

/**
 * "You said → Try", word by word: in her sentence the words that change are struck through in red;
 * in the better sentence the new words are bold on green. Shared by the live card and the chat.
 */
export function SaidTry({ transcript, fix, tip, compact = false }: { transcript: string; fix: GrammarFix; tip?: string | null; compact?: boolean }) {
  const said = closestSpan(closestSentence(transcript, fix.better), fix.better);
  const diff = diffWords(said, fix.better);
  // A whole new sentence (not a small fix) reads better plain than covered in marks.
  const kept = diff.better.filter((p) => !p.changed).reduce((n, p) => n + p.text.trim().split(/\s+/).filter(Boolean).length, 0);
  const total = fix.better.trim().split(/\s+/).length;
  const rewrite = kept / Math.max(1, total) < 0.4;
  if (rewrite) {
    diff.said = [{ text: said, changed: false }];
    diff.better = [{ text: fix.better, changed: false }];
  }
  return (
    <div className={cn('flex flex-col', compact ? 'gap-1' : 'gap-1.5')}>
      <p className={cn('leading-snug text-ink-2', compact ? 'text-[13.5px]' : 'text-[14.5px]')}>
        <span className="mr-1.5 text-[11.5px] font-extrabold tracking-wide text-ink-2 uppercase">{t.conversation.youSaidLabel}</span>{' '}
        {diff.said.map((part, i) =>
          part.changed ? (
            <s key={i} className="text-danger-ink decoration-danger-ink decoration-2">
              {part.text}
            </s>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </p>
      <p className={cn('leading-snug font-bold text-ink', compact ? 'text-[15px]' : 'text-[17px]')}>
        <span className="mr-1.5 text-[11.5px] font-extrabold tracking-wide text-action uppercase">{t.conversation.tryLabel}</span>{' '}
        {diff.better.map((part, i) =>
          part.changed ? (
            <ins key={i} className="rounded-[4px] bg-ok-bg px-0.5 text-ok no-underline">
              {part.text}
            </ins>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </p>
      {tip && (
        <p className={cn('leading-5 text-ink', compact ? 'text-[13px]' : 'text-[14px]')}>
          <b className="text-action">{t.conversation.tip}:</b> {tip}
        </p>
      )}
    </div>
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
    <li className="flex animate-rise items-end gap-1.5 pr-10">
      <ParentAvatar character={character} />
      <div className="flex min-w-0 flex-1 items-start gap-2 rounded-[22px] rounded-bl-md bg-aqua py-2.5 pr-2.5 pl-3.5">
        <p className="flex-1 text-[15.5px] leading-[23px]">
          <span className="sr-only">{character.name}: </span>
          {text}
        </p>
        {showSpeaker && <SpeakerButton text={text} speechId={speechId} size="sm" className="mt-0.5" />}
      </div>
    </li>
  );
});

/** Her side of the chat: what she said (slip marked), then the correction or "Well said!" under it. */
export const UserBubble = memo(function UserBubble({
  reply,
  showCorrection = true,
  children,
}: {
  reply: Reply;
  /** False: her words only (the live card is showing the verdict, or the first chat, which is never marked). */
  showCorrection?: boolean;
  children?: ReactNode;
}) {
  const slips = slipsOf(reply.feedback);
  return (
    <li className="flex animate-rise flex-col items-end gap-1.5 pl-10">
      <div className="max-w-full rounded-[22px] rounded-br-md border-2 border-action bg-surface px-3.5 py-2.5">
        <p className="text-[15.5px] leading-[23px]">
          <span className="sr-only">{t.conversation.you}: </span>
          <HighlightedText text={reply.transcript} phrases={slips.map((s) => s.wrong)} />
        </p>
      </div>
      {!showCorrection ? null : slips.length ? (
        <div className="w-full rounded-[18px] border-2 border-action/70 bg-surface px-3.5 py-2.5">
          {slips.length === 1 ? <CategoryBadge category={slips[0]?.category} /> : <p className="text-[13px] font-extrabold text-action">{t.conversation.slipCount(slips.length)}</p>}
          <div className="mt-1.5">
            <SlipList transcript={reply.transcript} slips={slips} corrected={reply.feedback.corrected} compact />
          </div>
          {children}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 pr-1 text-[13.5px] font-bold text-ok">
          <CheckIcon size={15} strokeWidth={3} />
          {t.conversation.wellSaid}
        </p>
      )}
    </li>
  );
});

/** While she speaks: Gemini's live transcript of her words, growing as she talks. */
export function LiveBubble({ text, active }: { text: string; active: boolean }) {
  return (
    <li className="flex flex-col items-end pl-10">
      <div className="max-w-full rounded-[22px] rounded-br-md border-2 border-dashed border-action/60 bg-surface px-3.5 py-2.5">
        <p className="text-[15.5px] leading-[23px] text-ink">
          <span className="sr-only">{t.conversation.liveYou}: </span>
          {text}
          {active && (
            <span className="ml-1 inline-flex translate-y-[-2px] gap-1 align-middle" aria-label={text ? undefined : t.conversation.listeningDots}>
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-bounce rounded-full bg-action" style={{ animationDelay: `${i * 140}ms` }} />
              ))}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

/** The live correction card that floats above the controls, then docks into the chat. */
export const CorrectionCard = memo(function CorrectionCard({
  reply,
  momentId,
  seconds,
  onDismiss,
  onRetry,
}: {
  reply: Reply;
  momentId?: string;
  /** Countdown before it docks into the chat; null = stays until dismissed. */
  seconds: number | null;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const { fix, positives, corrected } = reply.feedback;
  const slips = slipsOf(reply.feedback);
  const many = slips.length > 1;
  const lineActions = (text: string, key: string) => (
    <span className="flex shrink-0 flex-col gap-1.5">
      <SpeakerButton text={text} speechId={`fix:${reply.turnId}:${reply.attempt}:${key}`} size="sm" />
      <SaveLineButton text={text} momentId={momentId} size="sm" />
    </span>
  );
  return (
    <section
      aria-label={fix ? t.conversation.grammarFix : t.conversation.wellSaidTitle}
      className={cn('relative animate-rise overflow-hidden rounded-[22px] border-2 bg-surface px-4 pt-3 pb-3.5 shadow-card', fix ? 'border-action' : 'border-ok-dot')}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {fix ? (
            <>
              <h3 className="text-[14px] font-extrabold text-action">{many ? t.conversation.grammarFixes(slips.length) : t.conversation.grammarFix}</h3>
              {!many && <CategoryBadge category={slips[0]?.category} />}
            </>
          ) : (
            <h3 className="flex items-center gap-1.5 text-[15px] font-extrabold text-ok">
              <span className="flex size-6 animate-pop items-center justify-center rounded-full bg-ok-bg">
                <CheckIcon size={14} strokeWidth={3} />
              </span>
              {t.conversation.wellSaidTitle}
            </h3>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t.conversation.dismiss}
          className="-mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-mist"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <ul className="mt-1 space-y-1">
        {positives.map((p) => (
          <li key={p} className="flex items-center gap-2 text-[14px] font-bold text-ok">
            <CheckIcon size={14} strokeWidth={3} className="shrink-0" />
            {p}
          </li>
        ))}
      </ul>

      {fix && (
        <>
          <div className={cn('mt-2.5 rounded-[16px] bg-mist px-3 py-2.5', many && 'max-h-[42vh] overflow-y-auto overscroll-contain')} tabIndex={many ? 0 : undefined} aria-label={many ? t.conversation.slipCount(slips.length) : undefined} role={many ? 'group' : undefined}>
            <SlipList transcript={reply.transcript} slips={slips} corrected={corrected} actions={many ? lineActions : undefined} />
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border-2 border-action bg-surface px-4 text-[15px] font-bold text-action hover:bg-sky/50"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t.conversation.sayItAgain}
            </button>
            {!many && (
              <span className="ml-auto flex gap-1.5">
                <SpeakerButton text={fix.better} speechId={`fix:${reply.turnId}:${reply.attempt}`} />
                <SaveLineButton text={fix.better} momentId={momentId} />
              </span>
            )}
          </div>
        </>
      )}

      {seconds !== null && (
        <span
          key={`${reply.turnId}:${reply.attempt}`}
          className="fix-countdown absolute inset-x-0 bottom-0 h-[3px] origin-left bg-action/70"
          style={{ animationDuration: `${seconds}s` }}
          aria-hidden="true"
        />
      )}
    </section>
  );
});
