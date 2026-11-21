import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, resolvedTheme, setThemePref, themePref } from './theme';

function mockDark(dark: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: dark && q.includes('dark'), addEventListener: () => undefined }));
}

describe('appearance', () => {
  afterEach(() => {
    setThemePref('auto');
    vi.unstubAllGlobals();
  });

  it('follows the phone on Auto and remembers a choice on this device', () => {
    mockDark(true);
    expect(themePref()).toBe('auto');
    expect(resolvedTheme()).toBe('dark');
    setThemePref('light');
    expect(themePref()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    setThemePref('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('keeps the admin console light', () => {
    mockDark(true);
    setThemePref('dark');
    window.history.pushState({}, '', '/admin');
    applyTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
    window.history.pushState({}, '', '/');
  });
});
