import { TalkingAvatar } from '@interviewflowai/talking-avatar';
import femaleUrl from '@interviewflowai/talking-avatar/avatars/female.glb?url';
import maleUrl from '@interviewflowai/talking-avatar/avatars/male.glb?url';
import modelUrl from '@interviewflowai/talking-avatar/viseme-model.bin?url';
import { useEffect, useRef } from 'react';
import { expectStageSpeaker, setStageSpeaker } from '@/lib/speech';

/**
 * The parent as a talking 3D head (@interviewflowai/talking-avatar, MIT; Microsoft Rocketbox avatars).
 * Lip sync runs entirely in the browser from the line's audio: nothing is sent anywhere. The model
 * and both avatars are served from this app (no CDN). Loaded lazily, only on the role-play screen.
 */
export default function TalkingParent({
  man,
  thinking,
  onReady,
  onFail,
}: {
  man: boolean;
  thinking: boolean;
  onReady: () => void;
  onFail: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const avatar = useRef<TalkingAvatar | null>(null);
  const callbacks = useRef({ onReady, onFail });
  callbacks.current = { onReady, onFail };

  useEffect(() => {
    const container = box.current;
    if (!container) return;
    let live = true;
    let ready = false;
    let unregister: (() => void) | null = null;
    const loaded = expectStageSpeaker(); // the first line waits for the face, briefly
    let instance: TalkingAvatar;
    try {
      instance = new TalkingAvatar({
        container,
        avatarUrl: man ? maleUrl : femaleUrl,
        modelUrl,
        onError: (error) => {
          if (!live) return;
          if (!ready) {
            loaded();
            callbacks.current.onFail();
          } else {
            console.warn('3D avatar:', error.message); // e.g. a line it couldn't analyse; the audio still plays
          }
        },
      });
    } catch {
      loaded();
      callbacks.current.onFail();
      return;
    }
    avatar.current = instance;
    instance.ready.then(
      () => {
        if (!live) return;
        ready = true;
        unregister = setStageSpeaker({ speak: (audio) => instance.speak(audio), stop: () => instance.stopSpeaking() });
        loaded();
        callbacks.current.onReady();
      },
      () => {
        loaded();
        if (live) callbacks.current.onFail();
      },
    );
    return () => {
      live = false;
      loaded();
      unregister?.();
      avatar.current = null;
      instance.dispose();
    };
  }, [man]);

  useEffect(() => {
    avatar.current?.setStatus(thinking ? 'thinking' : 'listening');
  }, [thinking]);

  return <div ref={box} className="absolute inset-0" aria-hidden="true" />;
}
