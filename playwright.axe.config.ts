import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Osobna konfiguracja audytu axe-core prawdziwej aplikacji (axe-app.spec.ts): wlasny port, desktop i mobile.
const PORT = Number(process.env['F2_AXE_PORT'] ?? 5731);
const systemChromium = process.env['F2_CHROMIUM'] ?? '/usr/bin/chromium';
const launchOptions = {
  ...(existsSync(systemChromium) && !process.env['CI'] ? { executablePath: systemChromium } : {}),
  args: [
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
};

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/axe',
  testMatch: /axe-app\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 600_000,
  expect: { timeout: 120_000 },
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1280, height: 800 }, launchOptions },
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
    command: `pnpm --filter @f2/web dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: process.env['F2_REUSE_SERVER'] === '1' && !process.env['CI'],
    timeout: 60_000,
  },
});
