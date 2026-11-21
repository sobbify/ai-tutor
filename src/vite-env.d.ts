/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: 'mock' | 'http';
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Optional bridge an embedding shell (e.g. the Electron wrapper's preload) can expose. */
interface Window {
  aiTutorHost?: { exit?: () => void };
}
