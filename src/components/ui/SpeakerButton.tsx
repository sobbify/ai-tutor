import { memo, useCallback } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { speechSupported, useSpeech } from '@/lib/speech';
import { SpeakerIcon } from './Icons';

interface SpeakerButtonProps {
  text: string;
  /** Unique id so only the playing button shows as active. Defaults to the text. */
  speechId?: string;
  /** GET audio URL (phrasebook lines, kept offline). */
  src?: string;
  size?: 'md' | 'sm';
  className?: string;
}

/** Round outlined speaker button that reads `text` aloud; tap again to stop. */
export const SpeakerButton = memo(function SpeakerButton({ text, speechId = text, src, size = 'md', className }: SpeakerButtonProps) {
  const playing = useSpeech((s) => s.speakingId === speechId);
  const speak = useSpeech((s) => s.speak);
  const stop = useSpeech((s) => s.stop);
  const onClick = useCallback(() => (playing ? stop() : speak(text, speechId, src)), [playing, speak, stop, text, speechId, src]);

  if (!speechSupported) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={playing ? t.common.stopListening : t.common.listen(text)}
      aria-pressed={playing}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border-2 border-action text-action transition-colors',
        size === 'md' ? 'size-11' : 'size-8 border-[1.5px]',
        playing ? 'bg-action text-on-action' : 'bg-surface hover:bg-sky/50',
        className,
      )}
    >
      <SpeakerIcon size={size === 'md' ? 18 : 15} />
    </button>
  );
});
