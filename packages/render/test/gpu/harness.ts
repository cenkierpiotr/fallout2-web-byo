import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';

/** Testy GPU wymagaja F2_GAME_DIR (konwencja e2e projektu) i systemowego Chromium. */
export const CHROMIUM = process.env['F2_CHROMIUM'] ?? '/usr/bin/chromium';
export const GPU_SKIP = !process.env['F2_GAME_DIR'] || !existsSync(CHROMIUM);

/** Bundluje device.ts (+ SpriteBatch, Camera2D) do IIFE `F2R`, bez engine-core. */
export async function bundleDevice(): Promise<string> {
  const req = createRequire(createRequire(import.meta.url).resolve('vitest/package.json'));
  const viteReq = createRequire(req.resolve('vite/package.json'));
  const esbuild = viteReq('esbuild') as typeof import('esbuild');
  const entry = fileURLToPath(new URL('./device-entry.ts', import.meta.url));
  const out = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    globalName: 'F2R',
    write: false,
    platform: 'browser',
    target: 'es2022',
  });
  return out.outputFiles[0]!.text;
}

export async function launch(): Promise<Browser> {
  return chromium.launch({
    executablePath: CHROMIUM,
    args: [
      '--use-angle=swiftshader',
      '--use-gl=angle',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
}

export async function newPage(browser: Browser, script?: string): Promise<Page> {
  const page = await browser.newPage();
  await page.setContent('<canvas id="c" width="64" height="64"></canvas>');
  if (script) await page.addScriptTag({ content: script });
  return page;
}
