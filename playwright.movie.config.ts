import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Osobna konfiguracja e2e filmow (MVE): wlasny port, bez Playground UI.
const PORT = Number(process.env['F2_MOVIE_PORT'] ?? 5640);
const systemChromium = process.env['F2_CHROMIUM'] ?? '/usr/bin/chromium';

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/movie',
  testMatch: /movie\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    launchOptions: {
      ...(existsSync(systemChromium) && !process.env['CI']
        ? { executablePath: systemChromium }
        : {}),
      args: ['--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: {
    command: `pnpm --filter @f2/web dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: process.env['F2_REUSE_SERVER'] === '1' && !process.env['CI'],
    timeout: 60_000,
  },
});
