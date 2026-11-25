import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type CDPSession } from '@playwright/test';
import { GAME_DIR } from './helpers';
import { game, openMap, presetStorage } from './map-helpers';

/**
 * Pomiary wydajnosci "na telefonie" w emulacji (tylko Chromium: CDP). Parametry wprost, patrz
 * dokumentacja techniczna
 *  - throttling CPU 1x / 4x / 6x (`Emulation.setCPUThrottlingRate`): 4x ~ telefon klasy sredniej, 6x ~ slaby;
 *  - throttling sieci (`Network.emulateNetworkConditions`): ok. 9 Mb/s w dol, 1,5 Mb/s w gore, 60 ms opoznienia;
 *  - czas klatki p50/p95: roznica miedzy kolejnymi `requestAnimationFrame` oraz czas CPU budowy+wysylki klatki
 *    (`buildMs`+`submitMs`; tylko ta czesc przenosi sie na telefon, rasteryzacje robi SwiftShader na CPU hosta);
 *  - szczytowa pamiec JS: probkowanie `performance.memory.usedJSHeapSize` co 200 ms w calym tescie.
 * Wyniki: test-results/mobile/perf-<profil>-cpu<N>x.json.
 */
test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

const RATES = (process.env['F2_MOBILE_CPU_RATES'] ?? '1,4,6').split(',').map(Number);
const MAP = process.env['F2_MOBILE_MAP'] ?? 'ARVILLAG';
const FRAMES = Number(process.env['F2_MOBILE_FRAMES'] ?? 150);
/**
 * Budzet przy 4x throttlingu CPU (60 fps = 16,7 ms na klatke): typowa klatka (p50 czasu CPU build+submit)
 * <= 8 ms, a 95. percentyl <= 16,7 ms (nawet gorsze klatki mieszcza sie w jednym okresie 60 fps).
 */
const BUDGET_P50_CPU_MS_4X = Number(process.env['F2_MOBILE_BUDGET_P50_MS'] ?? 8);
const BUDGET_P95_CPU_MS_4X = Number(process.env['F2_MOBILE_BUDGET_MS'] ?? 16.7);

const pct = (a: number[], p: number): number => {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
};

async function throttle(cdp: CDPSession, rate: number, network: boolean): Promise<void> {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: network ? 60 : 0,
    downloadThroughput: network ? (9 * 1024 * 1024) / 8 : -1,
    uploadThroughput: network ? (1.5 * 1024 * 1024) / 8 : -1,
  });
}

for (const rate of RATES) {
  test(`pomiar mapy ${MAP}: CPU ${rate}x, siec 4G`, async ({
    page,
    browserName,
    hasTouch,
  }, info) => {
    test.skip(browserName !== 'chromium', 'CDP (throttling, pamiec) tylko w Chromium');
    // Profil desktopowy nie ma dotyku: `locator.tap()` rzuca, a pomiar "na telefonie" nie ma tam sensu.
    test.skip(!hasTouch, 'pomiar wymaga profilu dotykowego (mobile)');
    test.setTimeout(540_000);
    const cdp = await page.context().newCDPSession(page);
    await throttle(cdp, rate, true);
    await presetStorage(page, 1);
    await page.addInitScript(() => {
      const w = window as unknown as { __heapPeak: number };
      w.__heapPeak = 0;
      setInterval(() => {
        const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        if (m) w.__heapPeak = Math.max(w.__heapPeak, m.usedJSHeapSize);
      }, 200);
    });

    // start: nawigacja -> ekran pierwszego uruchomienia -> indeks gry -> mapa z pierwsza klatka
    const t0 = Date.now();
    await page.goto('/');
    await page.getByTestId('first-run').waitFor({ timeout: 120_000 });
    const tShell = Date.now() - t0;
    await page.setInputFiles('[data-testid=pick-folder-input]', GAME_DIR as string);
    await expect(page.getByTestId('status-text')).toContainText('30266', { timeout: 300_000 });
    const tIndex = Date.now() - t0;
    await page.getByTestId('tab-maps').tap();
    await expect(page.getByTestId('map-list')).toBeVisible({ timeout: 120_000 });
    await openMap(page, MAP);
    const tMap = Date.now() - t0;
    await page.waitForTimeout(1500);

    const measure = (zoom: number, pan: boolean): Promise<Record<string, number>> =>
      page
        .evaluate(
          ({ zoom, pan, frames }) =>
            new Promise<{ delta: number[]; cpu: number[]; calls: number[] }>((resolve) => {
              const g = (
                window as unknown as {
                  __f2game: {
                    iso: { x: number; y: number; zoom: number };
                    stats: Record<string, number>;
                    adaptive?: { enabled: boolean };
                  };
                }
              ).__f2game;
              g.iso.zoom = zoom;
              if (g.adaptive) g.adaptive.enabled = false;
              const out = { delta: [] as number[], cpu: [] as number[], calls: [] as number[] };
              const x0 = g.iso.x;
              const y0 = g.iso.y;
              let last = performance.now();
              let n = 0;
              const tick = (now: number): void => {
                const st = g.stats;
                out.delta.push(now - last);
                out.cpu.push((st['buildMs'] as number) + (st['submitMs'] as number));
                out.calls.push(st['drawCalls'] as number);
                last = now;
                n++;
                if (pan) {
                  const a = (n / frames) * Math.PI * 4;
                  g.iso.x = x0 + Math.cos(a) * 400 - 400;
                  g.iso.y = y0 + Math.sin(a) * 200;
                }
                if (n >= frames) resolve(out);
                else requestAnimationFrame(tick);
              };
              requestAnimationFrame(tick);
            }),
          { zoom, pan, frames: FRAMES },
        )
        .then((r) => {
          const cut = (a: number[]): number[] => a.slice(10);
          return {
            frameMsP50: +pct(cut(r.delta), 50).toFixed(2),
            frameMsP95: +pct(cut(r.delta), 95).toFixed(2),
            cpuMsP50: +pct(cut(r.cpu), 50).toFixed(2),
            cpuMsP95: +pct(cut(r.cpu), 95).toFixed(2),
            drawCalls: pct(cut(r.calls), 50),
          };
        });

    const static1 = await measure(1, false);
    const pan1 = await measure(1, true);
    const heapPeakMB = +(
      (await page.evaluate(() => (window as unknown as { __heapPeak: number }).__heapPeak)) /
      1048576
    ).toFixed(1);
    const heapNowMB = +(
      (await page.evaluate(
        () =>
          (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize,
      )) / 1048576
    ).toFixed(1);

    const result = {
      project: info.project.name,
      map: MAP,
      cpuThrottle: rate,
      viewport: page.viewportSize(),
      dpr: await page.evaluate(() => window.devicePixelRatio),
      startupMs: { shell: tShell, gameIndexed: tIndex, mapReady: tMap },
      static1,
      pan1,
      heapPeakMB,
      heapNowMB,
      budgetP50CpuMs4x: BUDGET_P50_CPU_MS_4X,
      budgetP95CpuMs4x: BUDGET_P95_CPU_MS_4X,
    };
    mkdirSync(join('test-results', 'mobile'), { recursive: true });
    writeFileSync(
      join('test-results', 'mobile', `perf-${info.project.name}-cpu${rate}x.json`),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
    expect(await game(page, (g) => g.batch.count)).toBeGreaterThan(0);
    if (rate === 4) expect(pan1.cpuMsP50).toBeLessThan(BUDGET_P50_CPU_MS_4X);
    if (rate === 4) expect(pan1.cpuMsP95).toBeLessThan(BUDGET_P95_CPU_MS_4X);
  });
}
