/**
 * Appearance: Auto (follow the phone), Light or Dark. Kept on this device only (it is a display
 * preference, not practice data). The admin console always stays light.
 */
export type ThemePref = 'auto' | 'light' | 'dark';

const KEY = 'elsa.theme';
const HEADER = { light: '#1f92fc', dark: '#173a66' } as const;
const listeners = new Set<() => void>();

export function themePref(): ThemePref {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function prefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolvedTheme(pref: ThemePref = themePref()): 'light' | 'dark' {
  if (window.location.pathname.startsWith('/admin')) return 'light';
  return pref === 'auto' ? (prefersDark() ? 'dark' : 'light') : pref;
}

export function applyTheme(): void {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', HEADER[theme]);
  listeners.forEach((fn) => fn());
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'auto') window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, pref);
  } catch {
    // Private mode / storage blocked: still apply for this visit.
  }
  applyTheme();
}

export function onThemeChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Call once at start-up: applies the theme and follows the phone's setting while on Auto. */
export function initTheme(): void {
  applyTheme();
  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
  }
}
