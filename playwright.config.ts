import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    permissions: ['microphone'],
    launchOptions: {
      // Fake microphone so the record → feedback flow runs headless.
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
      // Optional: point at an already-installed Chromium instead of `npx playwright install`.
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    },
  },
  projects: [{ name: 'mobile-chrome', use: { ...devices['Pixel 7'] } }],
  // The browser-only demo build: the e2e flow needs no backend (backend has its own pytest suite).
  webServer: { command: 'npm run build:mock && npm run preview', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
