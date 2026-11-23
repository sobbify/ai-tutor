import femaleUrl from '@interviewflowai/talking-avatar/avatars/female.glb?url';
import maleUrl from '@interviewflowai/talking-avatar/avatars/male.glb?url';
import modelUrl from '@interviewflowai/talking-avatar/viseme-model.bin?url';
import { wants3dAvatar } from '@/lib/avatar3d';

const started = new Set<string>();

/** Warm the browser cache for the 3D parent (code, lip-sync model, avatar) before the role-play opens. */
export function preloadAvatar(man: boolean): void {
  if (!wants3dAvatar()) return;
  void import('./TalkingParent').catch(() => undefined);
  for (const url of [modelUrl, man ? maleUrl : femaleUrl]) {
    if (started.has(url)) continue;
    started.add(url);
    void fetch(url).catch(() => started.delete(url));
  }
}
