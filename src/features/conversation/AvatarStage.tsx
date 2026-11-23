import { Component, lazy, memo, Suspense, useMemo, useState, type ReactNode } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import type { Character, Mood } from '@/types/tutor';
import { SpeakingBarsIcon } from '@/components/ui/Icons';
import { wants3dAvatar } from '@/lib/avatar3d';
import { Portrait } from './Portrait';
import { lookFor, type SceneKind } from './portraitLook';

const TalkingParent = lazy(() => import('./TalkingParent'));

/** If the 3D code can't load (offline, old phone), quietly keep the illustrated parent. */
class Fallback extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onError();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface AvatarStageProps {
  character: Character;
  /** The line being said; used as the video's caption track. */
  line: string;
  speaking: boolean;
  /** 'chat' when the chat history is open, 'feedback' while feedback shows: the tile shrinks. */
  compact: false | 'chat' | 'feedback';
  scene: SceneKind;
  mood: Mood;
  /** Provider clip for the current line. Null → the talking 3D parent, or the illustrated one. */
  videoUrl: string | null;
  /** Her reply is being checked: the parent waits, looking thoughtful. */
  thinking?: boolean;
}

/**
 * The parent's tile. A talking 3D head lip-synced to the line's audio where the phone can draw it
 * (TalkingParent), drawn over the moment's illustrated scene; the illustrated, animated portrait
 * meanwhile (while the 3D head loads) and wherever it can't. A `videoUrl` (and poster) shows real
 * video instead, with no layout change.
 */
export const AvatarStage = memo(function AvatarStage({ character, line, speaking, compact, videoUrl, scene, mood, thinking = false }: AvatarStageProps) {
  const look = lookFor(character);
  // Parents get the talking 3D head; ELSA, the coach, keeps her own illustrated look.
  const [three, setThree] = useState<'off' | 'loading' | 'on'>(() => (look.kind !== 'coach' && wants3dAvatar() ? 'loading' : 'off'));
  const man = look.kind === 'man';
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
        <>
          <Portrait character={character} scene={scene} mood={mood} speaking={speaking} tight={compact !== false} person={three !== 'on'} />
          {three !== 'off' && (
            <div className={cn('absolute inset-0 transition-opacity duration-500', three === 'on' ? 'opacity-100' : 'opacity-0')}>
              <Fallback onError={() => setThree('off')}>
                <Suspense fallback={null}>
                  <TalkingParent man={man} thinking={thinking} onReady={() => setThree('on')} onFail={() => setThree('off')} />
                </Suspense>
              </Fallback>
            </div>
          )}
        </>
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
