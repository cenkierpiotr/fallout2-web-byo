import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { GAME_DIR } from './helpers';
import { game, openMap, openMapScreen, presetStorage } from './map-helpers';

/**
 * Benchmark renderu mapy (WebGL2). Chromium bez GPU uzywa SwiftShader, wiec czas GPU
 * i bezwzgledny FPS NIE sa reprezentatywne dla telefonu. Mierzymy to, co przenosi sie na
 * urzadzenia: czas CPU budowy i wysylki klatki, liczbe wywolan rysowania, bajty wierzcholkow
 * i oszacowanie fill-rate. Wyniki: test-results/perf/<profil>-<mapa>.json (patrz dokumentacja techniczna).
 */
test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

const MAPS = (process.env['F2_PERF_MAPS'] ?? 'ARVILLAG,ARTEMPLE').split(',');
const FRAMES = Number(process.env['F2_PERF_FRAMES'] ?? 180);

interface Sample {
  build: number;
  submit: number;
  sprites: number;
  calls: number;
  bytes: number;
  fill: number;
  delta: number;
}

function pct(a: number[], p: number): number {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}
const avg = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function summarize(samples: Sample[]): Record<string, number> {
  const cpu = samples.map((s) => s.build + s.submit);
  return {
    frames: samples.length,
    cpuMsAvg: +avg(cpu).toFixed(3),
    cpuMsP95: +pct(cpu, 95).toFixed(3),
    buildMsAvg: +avg(samples.map((s) => s.build)).toFixed(3),
    submitMsAvg: +avg(samples.map((s) => s.submit)).toFixed(3),
    spritesAvg: Math.round(avg(samples.map((s) => s.sprites))),
    drawCallsAvg: +avg(samples.map((s) => s.calls)).toFixed(1),
    uploadKBAvg: +(avg(samples.map((s) => s.bytes)) / 1024).toFixed(1),
    fillMPxAvg: +(avg(samples.map((s) => s.fill)) / 1e6).toFixed(2),
    frameDeltaMsAvg: +avg(samples.map((s) => s.delta)).toFixed(2),
    frameDeltaMsP95: +pct(
      samples.map((s) => s.delta),
      95,
    ).toFixed(2),
  };
}

for (const map of MAPS) {
  test(`perf mapy ${map}`, async ({ page, browser }, info) => {
    test.setTimeout(360_000);
    await presetStorage(page, 1);
    await openMapScreen(page);
    await openMap(page, map);
    await page.waitForTimeout(1500);

    const run = async (zoom: number, pan: boolean): Promise<Record<string, number>> => {
      const samples = (await page.evaluate(
        ({ zoom, pan, frames }) =>
          new Promise<Sample[]>((resolve) => {
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
            if (g.adaptive) g.adaptive.enabled = false; // stala rozdzielczosc: pomiar porownywalny
            const out: Sample[] = [];
            const x0 = g.iso.x;
            const y0 = g.iso.y;
            let last = performance.now();
            let n = 0;
            const tick = (now: number): void => {
              const st = g.stats;
              out.push({
                build: st['buildMs'] as number,
                submit: st['submitMs'] as number,
                sprites: st['sprites'] as number,
                calls: st['drawCalls'] as number,
                bytes: st['uploadedBytes'] as number,
                fill: st['fillPixels'] as number,
                delta: now - last,
              });
              last = now;
              n++;
              if (pan) {
                const a = (n / frames) * Math.PI * 4;
                g.iso.x = x0 + Math.cos(a) * 400 - 400;
                g.iso.y = y0 + Math.sin(a) * 200;
              }
              if (n >= frames) resolve(out.slice(10));
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
        { zoom, pan, frames: FRAMES },
      )) as Sample[];
      return summarize(samples);
    };

    const tracePath = join('test-results', 'perf', `${info.project.name}-${map}-trace.json`);
    mkdirSync(join('test-results', 'perf'), { recursive: true });
    // Trace Chromium (devtools.timeline) tylko na zadanie: F2_PERF_TRACE=1 (zmienia zachowanie strony).
    const trace = process.env['F2_PERF_TRACE'] === '1';
    if (trace) {
      await browser.startTracing(page, {
        path: tracePath,
        categories: ['devtools.timeline', 'gpu'],
      });
    }
    // Profil CPU (V8) na zadanie: F2_PERF_PROFILE=1 -> test-results/perf/<profil>-<mapa>.cpuprofile + top funkcji.
    const profile = process.env['F2_PERF_PROFILE'] === '1';
    const cdp = profile ? await page.context().newCDPSession(page) : null;
    if (cdp) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
    }
    const result = {
      map,
      project: info.project.name,
      viewport: page.viewportSize(),
      dpr: await page.evaluate(() => window.devicePixelRatio),
      static1: await run(1, false),
      pan1: await run(1, true),
      pan2: await run(2, true),
    };
    if (trace) await browser.stopTracing();
    if (cdp) {
      const { profile: prof } = (await cdp.send('Profiler.stop')) as {
        profile: {
          nodes: {
            id: number;
            callFrame: { functionName: string; url: string; lineNumber: number };
          }[];
          samples: number[];
          timeDeltas: number[];
        };
      };
      writeFileSync(
        join('test-results', 'perf', `${info.project.name}-${map}.cpuprofile`),
        JSON.stringify(prof),
      );
      const self = new Map<number, number>();
      prof.samples.forEach((id, i) =>
        self.set(id, (self.get(id) ?? 0) + (prof.timeDeltas[i] as number)),
      );
      const byName = new Map<string, number>();
      for (const n of prof.nodes) {
        const key = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber}`;
        byName.set(key, (byName.get(key) ?? 0) + (self.get(n.id) ?? 0));
      }
      const top = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
      console.log(
        'TOP SELF (ms):\n' +
          top.map(([k, v]) => `${(v / 1000).toFixed(0).padStart(7)} ${k}`).join('\n'),
      );
    }
    writeFileSync(
      join('test-results', 'perf', `${info.project.name}-${map}.json`),
      JSON.stringify(result, null, 2),
    );
    console.log(JSON.stringify(result));
    expect((await game(page, (g) => g.batch.count)) > 0).toBe(true);
    expect(result.pan1.cpuMsP95).toBeLessThan(Number(process.env['F2_PERF_CPU_BUDGET_MS'] ?? 16));
  });
}
