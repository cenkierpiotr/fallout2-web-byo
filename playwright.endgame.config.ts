import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Osobna konfiguracja e2e zakonczenia/smierci/napisow/menu (Playground @f2/ui): wlasny port.
const PORT = Number(process.env['F2_ENDGAME_PORT'] ?? 5650);
const systemChromium = process.env['F2_CHROMIUM'] ?? '/usr/bin/chromium';
const launchOptions = {
  ...(existsSync(systemChromium) && !process.env['CI'] ? { executablePath: systemChromium } : {}),
};

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/endgame',
  testMatch: /endgame\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 720 }, launchOptions },
    },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        launchOptions,
      },
    },
  ],
  webServer: {
    command: `pnpm --filter @f2/ui exec vite playground --config playground/vite.config.ts --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: process.env['F2_REUSE_SERVER'] === '1' && !process.env['CI'],
    timeout: 60_000,
  },
});
