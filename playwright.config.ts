import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env['F2_WEB_PORT'] ?? process.env['F2_E2E_PORT'] ?? 5199);
const UI_PORT = Number(process.env['F2_UI_PORT'] ?? 5198);
/** Osobna instancja aplikacji dla testow ekranow @f2/ui w grze (game-ui.spec.ts). */
const GAME_UI_PORT = Number(process.env['F2_GAME_UI_PORT'] ?? 5622);
// Nie podpinaj sie pod cudzy serwer na tym porcie: domyslnie zawsze wlasny.
const REUSE = process.env['F2_REUSE_SERVER'] === '1' && !process.env['CI'];

// Gdy brak pobranych przegladarek Playwright, uzyj systemowego Chromium (F2_CHROMIUM albo /usr/bin/chromium).
const systemChromium = process.env['F2_CHROMIUM'] ?? '/usr/bin/chromium';
const launchOptions = {
  ...(existsSync(systemChromium) && !process.env['CI'] ? { executablePath: systemChromium } : {}),
  // WebGL2 w trybie headless bez GPU
  args: [
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
};

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/main',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore:
        /(playground|settings-controls|creator|character|inventory\.spec|saves|barter|dialog-ux|a11y|pipboy|rest|retro-polish-glyphs|game-ui|endgame|profiles|axe-app|fo1-hosted|fo1-real-data|skin-|touch-iface)/,
      use: { browserName: 'chromium', viewport: { width: 1920, height: 1080 }, launchOptions },
    },
    {
      name: 'mobile',
      testIgnore:
        /(playground|settings-controls|creator|character|inventory\.spec|saves|barter|dialog-ux|a11y|pipboy|rest|retro-polish-glyphs|game-ui|endgame|profiles|axe-app|fo1-hosted|fo1-real-data|skin-|touch-iface)/,
      use: { ...devices['Pixel 7'], launchOptions },
    },
    // Playground @f2/ui: profile urzadzen z ADR-0007
    {
      name: 'ui-desktop',
      testMatch:
        /(playground|settings-controls|creator|character|inventory\.spec|saves|barter|dialog-ux|a11y|pipboy|rest|retro-polish-glyphs)/,
      use: {
        browserName: 'chromium',
        baseURL: `http://localhost:${UI_PORT}`,
        viewport: { width: 1920, height: 1080 },
        launchOptions,
      },
    },
    {
      name: 'ui-mobile',
      testMatch:
        /(playground|settings-controls|creator|character|inventory\.spec|saves|barter|dialog-ux|a11y|pipboy|rest|retro-polish-glyphs)/,
      use: {
        browserName: 'chromium',
        baseURL: `http://localhost:${UI_PORT}`,
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        launchOptions,
      },
    },
    {
      name: 'ui-tablet',
      testMatch:
        /(playground|settings-controls|creator|character|inventory\.spec|saves|barter|dialog-ux|a11y|pipboy|rest|retro-polish-glyphs)/,
      use: {
        browserName: 'chromium',
        baseURL: `http://localhost:${UI_PORT}`,
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
        launchOptions,
      },
    },
    // Profile graczy i zapisy: prawdziwa gra, desktop i mobile 390x844 z dotykiem
    {
      name: 'profiles-desktop',
      testMatch: /profiles\.spec/,
      use: { browserName: 'chromium', viewport: { width: 1280, height: 800 }, launchOptions },
    },
    {
      name: 'profiles-mobile',
      testMatch: /profiles\.spec/,
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        launchOptions,
      },
    },
    {
      name: 'game-ui-desktop',
      testMatch: /game-ui/,
      use: {
        browserName: 'chromium',
        baseURL: `http://localhost:${GAME_UI_PORT}`,
        viewport: { width: 1920, height: 1080 },
        launchOptions,
      },
    },
    {
      name: 'game-ui-mobile',
      testMatch: /game-ui/,
      use: {
        ...devices['Pixel 7'],
        baseURL: `http://localhost:${GAME_UI_PORT}`,
        launchOptions,
      },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter @f2/web dev --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: REUSE,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @f2/web dev --port ${GAME_UI_PORT} --strictPort`,
      url: `http://localhost:${GAME_UI_PORT}`,
      reuseExistingServer: REUSE,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @f2/ui exec vite playground --config playground/vite.config.ts --host --port ${UI_PORT} --strictPort`,
      url: `http://localhost:${UI_PORT}`,
      reuseExistingServer: REUSE,
      timeout: 60_000,
    },
  ],
});
