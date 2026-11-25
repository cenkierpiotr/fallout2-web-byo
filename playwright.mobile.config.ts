import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Emulacja urzadzen mobilnych zamiast testow na fizycznych telefonach (dokumentacja techniczna).
 * Wlasne porty (5190+), wlasny outputDir: nie koliduje z innymi uruchomieniami Playwright.
 * Projekty `wk-*` = WebKit (silnik Safari), `cr-*` = Chromium z deskryptorami urzadzen.
 * Wybor: `--project=wk-iphone14` itd.
 */
const PORT = Number(process.env['F2_MOBILE_PORT'] ?? 5190);
const systemChromium = process.env['F2_CHROMIUM'] ?? '/usr/bin/chromium';
const chromiumLaunch = {
  ...(existsSync(systemChromium) && !process.env['CI'] ? { executablePath: systemChromium } : {}),
  args: [
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
};

/** Deskryptor urzadzenia z Chromium: usuwa `defaultBrowserType` (silnik wybieramy sami). */
const forChromium = (name: string): Record<string, unknown> => {
  const { defaultBrowserType: _ignored, ...rest } = devices[name] as Record<string, unknown>;
  void _ignored;
  return { ...rest, browserName: 'chromium', launchOptions: chromiumLaunch };
};

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: /mobile-(emulation|perf)\.spec\.ts/,
  outputDir: 'test-results/mobile-run',
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'off' },
  projects: [
    { name: 'wk-desktop-safari', use: { ...devices['Desktop Safari'] } },
    { name: 'wk-iphone14', use: { ...devices['iPhone 14'] } },
    { name: 'wk-iphone15', use: { ...devices['iPhone 15'] } },
    { name: 'cr-pixel7', use: forChromium('Pixel 7') },
    { name: 'cr-iphone14', use: forChromium('iPhone 14') },
    { name: 'cr-ipad', use: forChromium('iPad Pro 11') },
    {
      name: 'cr-small360',
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 640 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        launchOptions: chromiumLaunch,
      },
    },
  ],
  webServer: {
    command: `pnpm --filter @f2/web dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
