import { memo, useMemo } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import type { Character, Mood } from '@/types/tutor';
import { SpeakingBarsIcon } from '@/components/ui/Icons';
import { Portrait } from './Portrait';
import type { SceneKind } from './portraitLook';

interface AvatarStageProps {
  character: Character;
  /** The line being said; used as the video's caption track. */
  line: string;
  speaking: boolean;
  /** 'chat' when the chat history is open, 'feedback' while feedback shows: the tile shrinks. */
  compact: false | 'chat' | 'feedback';
  scene: SceneKind;
  mood: Mood;
  /** Provider clip for the current line. Null → placeholder (avatar provider not wired yet). */
  videoUrl: string | null;
}

/**
 * The parent's video tile. Until the AI-avatar provider is integrated this shows an illustrated,
 * animated portrait; pass `videoUrl` (and a poster) to switch to real video with no layout change.
 */
export const AvatarStage = memo(function AvatarStage({ character, line, speaking, compact, videoUrl, scene, mood }: AvatarStageProps) {
  const captions = useMemo(() => `data:text/vtt;charset=utf-8,${encodeURIComponent(`WEBVTT\n\n00:00.000 --> 10:00.000\n${line}\n`)}`, [line]);
  return (
    <figure
      className={cn(
        'relative mx-4 overflow-hidden rounded-video bg-[#26313d] shadow-soft transition-[height,margin] duration-300 ease-out',
        compact === 'feedback' ? 'mt-3 h-[150px]' : compact === 'chat' ? 'mt-3 h-[190px]' : 'mt-4 h-[250px]',
      )}
    >
      {videoUrl ? (
        <video
          key={videoUrl}
          className="size-full object-cover"
          src={videoUrl}
          poster={character.posterUrl ?? undefined}
          autoPlay
          playsInline
          preload="auto"
          aria-label={character.name}
        >
          <track kind="captions" srcLang="en" label="English" src={captions} default />
        </video>
      ) : (
        <Portrait character={character} scene={scene} mood={mood} speaking={speaking} tight={compact !== false} />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/50 to-transparent" aria-hidden="true" />
      <figcaption className="absolute bottom-3.5 left-3 text-[16px] font-bold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.5)]">
        {character.name}
      </figcaption>
      {speaking && (
        <span className="absolute right-3 bottom-3 inline-flex animate-pop items-center gap-1.5 rounded-full bg-speaking py-1 pr-3.5 pl-3 text-[15px] font-bold text-white">
          <SpeakingBarsIcon size={16} />
          {t.conversation.speaking}
        </span>
      )}
    </figure>
  );
});
