import { createHttpApi } from './httpApi';
import { createMockApi } from './mock/mockApi';
import type { TutorApi } from './types';

export type ApiMode = 'mock' | 'http';

export const apiMode: ApiMode = import.meta.env.VITE_API_MODE === 'mock' ? 'mock' : 'http';

/**
 * Builds the API for this environment. In mock mode, `?demo=progress` loads the
 * "journey in progress" state from the design and `?demo=reset` clears it.
 */
export function createApi(): TutorApi {
  // Compared against the build-time value directly, so production builds drop the demo mock API
  // (and its 40 KB of scripts) entirely.
  if (import.meta.env.VITE_API_MODE !== 'mock') return createHttpApi(import.meta.env.VITE_API_BASE_URL ?? '');

  const mock = createMockApi();
  const demo = new URLSearchParams(window.location.search).get('demo');
  if (demo === 'progress') mock.seedDemoProgress();
  if (demo === 'group') {
    mock.seedDemoProgress();
    mock.seedDemoGroup();
  }
  if (demo === 'reset') mock.reset();
  if (demo) {
    const url = new URL(window.location.href);
    url.searchParams.delete('demo');
    window.history.replaceState(window.history.state, '', url);
  }
  return mock;
}
