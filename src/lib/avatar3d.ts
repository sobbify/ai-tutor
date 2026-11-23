import { geminiVoiceAvailable } from './audio/voice';

/**
 * The talking 3D parent (features/conversation/TalkingParent.tsx). On by default where the phone
 * can draw it; Settings can switch it off (older phones, or to save data). Kept on this device.
 */
const KEY = 'elsa.avatar3d';
let webgl2: boolean | undefined;

export function avatar3dPref(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAvatar3dPref(on: boolean): void {
  try {
    if (on) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, 'off');
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}

/** WebGL 2 and AudioWorklet: what the avatar needs to draw and to listen to its own voice. */
export function canDraw3d(): boolean {
  if (webgl2 === undefined) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      webgl2 = Boolean(gl);
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      webgl2 = false;
    }
  }
  return webgl2 && typeof AudioWorkletNode !== 'undefined';
}

/**
 * Show the 3D parent? Only with Gemini's voice: its mouth follows real audio, and the browser's
 * built-in voice can't be routed through it (the illustrated portrait animates for that instead).
 */
export function wants3dAvatar(): boolean {
  return avatar3dPref() && geminiVoiceAvailable() && canDraw3d();
}
