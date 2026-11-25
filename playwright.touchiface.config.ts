import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Nie podpinaj sie pod cudzy serwer na tym porcie (z innego worktree z innym kodem): domyslnie wlasny.
const REUSE = process.env['F2_REUSE_SERVER'] === '1' && !process.env['CI'];
// Gdy brak pobranych przegladarek Playwright, uzyj systemowego Chromium (F2_CHROMIUM albo /usr/bin/chromium).
const systemChromium = process.env['F2_CHROMIUM'] ?? '/usr/bin/chromium';
const launchOptions = {
  ...(existsSync(systemChromium) && !process.env['CI'] ? { executablePath: systemChromium } : {}),
  args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
};

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /touch-iface/,
  outputDir: 'test-results/touchiface',
  workers: 1,
  timeout: 700_000,
  reporter: [['list']],
  projects: [
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        baseURL: 'http://localhost:5682',
        viewport: { width: 873, height: 393 },
        hasTouch: true,
        isMobile: true,
        launchOptions,
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @f2/web dev --port 5682 --strictPort',
      url: 'http://localhost:5682',
      reuseExistingServer: REUSE,
      timeout: 90_000,
    },
  ],
});
