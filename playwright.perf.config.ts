import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Osobna konfiguracja benchmarku renderu mapy (perf-map.spec.ts, perf-mobile.spec.ts): wlasny port i outputDir,
// zeby nie kolidowac z innymi uruchomieniami Playwright w tym samym worktree.
const PORT = Number(process.env['F2_PERF_PORT'] ?? 5660);
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
  outputDir: 'test-results/perf-run',
  testMatch: /perf-(map|mobile)\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'off' },
  projects: [
    {
      name: 'desktop',
      use: { browserName: 'chromium', viewport: { width: 1920, height: 1080 }, launchOptions },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions } },
  ],
  webServer: {
    command: `pnpm --filter @f2/web dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
