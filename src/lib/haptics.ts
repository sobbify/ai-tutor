/** A light buzz on phones that support it (never on desktop; silently ignored elsewhere). */
export function buzz(pattern: number | number[] = 12): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator && window.matchMedia?.('(pointer: coarse)').matches) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Some browsers throw when vibration is not allowed: it is only a nicety.
  }
}
