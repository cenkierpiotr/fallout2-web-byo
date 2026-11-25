import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { GAME_DIR } from './helpers';
import { game, openMap, openMapScreen } from './map-helpers';

/**
 * Budzet klatki na waskim ekranie telefonu (viewport 390 px, preset 'niski' = to, co dostaje
 * 'auto' na mobile wg QualityPresets). SwiftShader nie odzwierciedla GPU telefonu, wiec mierzymy
 * czas CPU budowy i wysylki klatki (build + submit) oraz liczbe wywolan rysowania, a progi sa
 * LUZNE i skalowane obciazeniem maszyny: kalibracja stalego zadania JS w stronie (im wolniej
 * niz wzorzec, tym wiekszy mnoznik budzetu, do limitu), mediana zamiast p95 i jedna powtorka.
 * Wyniki: test-results/perf/mobile-390-<mapa>.json.
 */
test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });

const MAP = process.env['F2_PERF_MOBILE_MAP'] ?? 'ARVILLAG';
const FRAMES = Number(process.env['F2_PERF_FRAMES'] ?? 120);
/** Bazowy budzet mediany CPU klatki (ms) przy braku obciazenia maszyny; luzny: telefon ma ~16.7 ms. */
const BASE_BUDGET_MS = Number(process.env['F2_PERF_MOBILE_BUDGET_MS'] ?? 12);
const MAX_LOAD_FACTOR = 8;

interface Sample {
  cpu: number;
  calls: number;
  sprites: number;
}

const median = (a: number[]): number => {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] as number;
};

/** Czas stalego zadania JS w stronie (ms): wzorzec obciazenia maszyny testowej. */
async function calibrate(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const run = (): number => {
      const t0 = performance.now();
      let x = 0;
      for (let i = 0; i < 4_000_000; i++) x += Math.sqrt(i) * 0.5;
      if (x < 0) console.log(x);
      return performance.now() - t0;
    };
    return Math.min(run(), run(), run());
  });
}

async function measure(page: import('@playwright/test').Page, zoom: number): Promise<Sample[]> {
  return page.evaluate(
    ({ zoom, frames }) =>
      new Promise<Sample[]>((resolve) => {
        const g = (
          window as unknown as {
            __f2game: {
              iso: { zoom: number };
              stats: Record<string, number>;
              adaptive?: { enabled: boolean };
            };
          }
        ).__f2game;
        g.iso.zoom = zoom;
        if (g.adaptive) g.adaptive.enabled = false;
        const out: Sample[] = [];
        let n = 0;
        const tick = (): void => {
          const st = g.stats;
          out.push({
            cpu: (st['buildMs'] as number) + (st['submitMs'] as number),
            calls: st['drawCalls'] as number,
            sprites: st['sprites'] as number,
          });
          n++;
          if (n >= frames)
            resolve(out.slice(10)); // bez rozgrzewki
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { zoom, frames: FRAMES },
  );
}

test(`perf mobile 390 px: budzet klatki mapy ${MAP}`, async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'pl');
    // preset 'niski' = mobile; debugOverlay wlacza statystyki klatki
    localStorage.setItem(
      'f2-settings',
      JSON.stringify({ debugOverlay: true, defaultZoom: 1, graphicsPreset: 'niski' }),
    );
  });
  await openMapScreen(page);
  await openMap(page, MAP);
  await page.waitForTimeout(1500);

  expect(await page.evaluate(() => window.innerWidth)).toBe(390);

  const baseline = await calibrate(page); // ms na zdrowej maszynie ok. 10-15
  const REF_MS = 15;
  const factor = Math.min(MAX_LOAD_FACTOR, Math.max(1, baseline / REF_MS));
  const budget = BASE_BUDGET_MS * factor;

  let samples = await measure(page, 1);
  let med = median(samples.map((s) => s.cpu));
  if (med > budget) {
    // chwilowy skok obciazenia serwera: jedna powtorka po krotkiej przerwie
    await page.waitForTimeout(3000);
    samples = await measure(page, 1);
    med = Math.min(med, median(samples.map((s) => s.cpu)));
  }
  const calls = median(samples.map((s) => s.calls));
  const sprites = median(samples.map((s) => s.sprites));

  const result = {
    map: MAP,
    viewport: page.viewportSize(),
    baselineMs: +baseline.toFixed(1),
    loadFactor: +factor.toFixed(2),
    budgetMs: +budget.toFixed(1),
    cpuMsMedian: +med.toFixed(3),
    drawCallsMedian: calls,
    spritesMedian: sprites,
  };
  mkdirSync(join('test-results', 'perf'), { recursive: true });
  writeFileSync(
    join('test-results', 'perf', `mobile-390-${MAP}.json`),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));

  expect(await game(page, (g) => g.batch.count)).toBeGreaterThan(0);
  expect(med).toBeLessThan(budget);
  // liczba wywolan rysowania: grupy per atlas, nie per sprite (luzny limit regresji)
  expect(calls).toBeLessThan(400);
});
