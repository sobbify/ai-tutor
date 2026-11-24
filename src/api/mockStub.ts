import type { TutorApi } from './types';

/** Stands in for the demo mock API in real production builds (see vite.config.ts). Never called. */
export function createMockApi(): TutorApi & { reset(): void; seedDemoProgress(): void; seedDemoGroup(): void } {
  throw new Error('The demo mock API is not part of this build.');
}
