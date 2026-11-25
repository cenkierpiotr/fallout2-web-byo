import { mkdirSync } from 'node:fs';
import { expect, test, type BrowserContext } from '@playwright/test';
import { GAME_DIR, collectErrors } from './helpers';
import { openMap, openMapScreen } from './map-helpers';

/**
 * M9 na prawdziwej mapie z danymi gry: preset ultra (swiatla 'sun+points', cienie, SSAO, grading)
 * musi zmienic obraz wzgledem presetu klasycznego, bez bledow GL; renderWorker (flaga) musi dac
 * obraz zblizony do trybu glownego watku. Zrzuty tylko w katalogu F2_M9_SHOTS (np. /tmp/m9).
 */
test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

const SHOTS = process.env['F2_M9_SHOTS'];
const MAP = 'ARCAVES';
const HEX = 11304;

interface Snap {
  png: Buffer;
  errors: string[];
  mode: string;
  plan: { active: boolean; lighting: boolean; preset: string };
}

async function capture(
  context: BrowserContext,
  name: string,
  settings: Record<string, unknown>,
): Promise<Snap> {
  // Swiezy kontekst na kazdy zrzut: ponowny import folderu w tym samym kontekscie Chromium bywa trwale
  // zwracac NotFound/NotReadableError dla plikow z setInputFiles (artefakt testu, nie bug aplikacji).
  const u = test.info().project.use;
  const own = await context.browser()!.newContext({
    baseURL: u.baseURL as string,
    viewport: u.viewport ?? null,
    ...(u.userAgent ? { userAgent: u.userAgent } : {}),
    ...(u.deviceScaleFactor ? { deviceScaleFactor: u.deviceScaleFactor } : {}),
    ...(u.isMobile !== undefined ? { isMobile: u.isMobile } : {}),
    ...(u.hasTouch !== undefined ? { hasTouch: u.hasTouch } : {}),
  });
  const page = await own.newPage();
  try {
    const errors = collectErrors(page);
    await page.addInitScript((s) => {
      localStorage.setItem('locale', 'pl');
      localStorage.setItem(
        'f2-settings',
        JSON.stringify({ debugOverlay: false, defaultZoom: 2, ...s }),
      );
    }, settings);
    await openMapScreen(page);
    await openMap(page, MAP);
    await page.evaluate(
      (h) =>
        (window as unknown as { __f2game: { centerOn(h: number): void } }).__f2game.centerOn(h),
      HEX,
    );
    await page.waitForTimeout(3000);
    const meta = await page.evaluate(() => {
      const g = (
        window as unknown as {
          __f2game: { deviceMode: string; gfx: { current: Snap['plan'] } };
        }
      ).__f2game;
      return { mode: g.deviceMode, plan: { ...g.gfx.current } };
    });
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
    const png = await page
      .locator('canvas')
      .first()
      .screenshot(SHOTS ? { path: `${SHOTS}/${name}.png` } : {});
    return { png, errors: errors.filter((e) => !/favicon/i.test(e)), ...meta };
  } finally {
    await own.close();
  }
}

/** Srednia bezwzgledna roznica kanalow RGB (0-255), liczona w przegladarce (bez zaleznosci od PNG w node). */
async function meanDiff(context: BrowserContext, a: Buffer, b: Buffer): Promise<number> {
  const page = await context.newPage();
  try {
    await page.goto('about:blank');
    return await page.evaluate(
      async ([x, y]) => {
        const load = async (b64: string): Promise<ImageData> => {
          const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
          const bmp = await createImageBitmap(blob);
          const c = new OffscreenCanvas(bmp.width, bmp.height);
          const ctx = c.getContext('2d')!;
          ctx.drawImage(bmp, 0, 0);
          return ctx.getImageData(0, 0, bmp.width, bmp.height);
        };
        const A = await load(x!);
        const B = await load(y!);
        if (A.width !== B.width || A.height !== B.height) return 255;
        let sum = 0;
        for (let i = 0; i < A.data.length; i++) {
          if (i % 4 !== 3) sum += Math.abs(A.data[i]! - B.data[i]!);
        }
        return sum / ((A.data.length / 4) * 3);
      },
      [a.toString('base64'), b.toString('base64')],
    );
  } finally {
    await page.close();
  }
}

test.describe('M9 wizualnie na danych gry', () => {
  test('ultra (sun+points, cienie, SSAO, grading) zmienia obraz wzgledem klasycznego', async ({
    context,
  }) => {
    test.setTimeout(360_000);
    const classic = await capture(context, 'classic', { graphicsPreset: 'retro' });
    const ultra = await capture(context, 'ultra', {
      graphicsPreset: 'ultra',
      postFx: true,
      lighting: true,
    });
    expect(classic.errors).toEqual([]);
    expect(ultra.errors).toEqual([]);
    expect(classic.plan.active).toBe(false);
    expect(ultra.plan.active).toBe(true);
    expect(ultra.plan.preset).toBe('ultra');
    const d = await meanDiff(context, classic.png, ultra.png);
    console.log(`m9 ultra vs klasyczny: srednia roznica ${d.toFixed(2)}/255`);
    expect(d).toBeGreaterThan(1);
  });

  test('renderWorker: GL w workerze daje obraz zblizony do glownego watku', async ({ context }) => {
    test.setTimeout(360_000);
    const main = await capture(context, 'main-device', { graphicsPreset: 'wysoki', postFx: true });
    const worker = await capture(context, 'worker-device', {
      graphicsPreset: 'wysoki',
      postFx: true,
      renderWorker: true,
    });
    expect(main.mode).toBe('main');
    expect(worker.mode).toBe('worker');
    expect(main.errors).toEqual([]);
    expect(worker.errors).toEqual([]);
    const d = await meanDiff(context, main.png, worker.png);
    console.log(`renderWorker vs main: srednia roznica ${d.toFixed(2)}/255`);
    expect(d).toBeLessThan(6);
  });

  test('renderWorker + ultra: swiatla punktowe, cienie i SSAO tez w workerze', async ({
    context,
  }) => {
    test.setTimeout(360_000);
    const ultra = { graphicsPreset: 'ultra', postFx: true, lighting: true };
    const main = await capture(context, 'ultra-main-device', ultra);
    const worker = await capture(context, 'ultra-worker-device', { ...ultra, renderWorker: true });
    expect(worker.mode).toBe('worker');
    expect(worker.plan.active).toBe(true);
    expect(worker.errors).toEqual([]);
    const d = await meanDiff(context, main.png, worker.png);
    console.log(`renderWorker ultra vs main ultra: srednia roznica ${d.toFixed(2)}/255`);
    expect(d).toBeLessThan(6);
  });
});
