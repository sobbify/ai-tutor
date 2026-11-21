import { memo, useCallback } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { usePhrasebook, useSavePhrase } from '@/hooks/queries';
import type { MomentId } from '@/types/tutor';
import { BookmarkIcon } from './Icons';

/** Bookmark a line into her phrasebook (FR-22). Filled once saved. */
export const SaveLineButton = memo(function SaveLineButton({
  text,
  momentId,
  size = 'md',
  className,
}: {
  text: string;
  momentId?: MomentId | null;
  size?: 'md' | 'sm';
  className?: string;
}) {
  const { data } = usePhrasebook();
  const save = useSavePhrase();
  const saved = Boolean(data?.some((p) => p.text === text.trim())) || save.isSuccess;
  const onClick = useCallback(() => {
    if (!saved) save.mutate({ text, momentId });
  }, [momentId, save, saved, text]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={save.isPending}
      aria-pressed={saved}
      aria-label={saved ? t.common.savedLine(text) : t.common.saveLine(text)}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border-2 border-action text-action transition-colors',
        size === 'md' ? 'size-11' : 'size-8 border-[1.5px]',
        saved ? 'bg-sky' : 'bg-surface hover:bg-sky/50',
        className,
      )}
    >
      <BookmarkIcon filled={saved} size={size === 'md' ? 18 : 15} />
    </button>
  );
});
