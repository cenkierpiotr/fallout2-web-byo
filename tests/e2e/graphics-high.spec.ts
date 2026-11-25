import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR } from './helpers';
import { game, openMap, openMapScreen } from './map-helpers';

/**
 * Preset 'wysoki' z postFx i oswietleniem 2.5D: mapa musi sie renderowac bez bledow GL
 * (desktop i telefon 390 px), a petla passow ma byc faktycznie aktywna.
 */
test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

const MAP = process.env['F2_GFX_MAP'] ?? 'ARVILLAG';

async function run(page: Page): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    const txt = m.text();
    if (m.type() === 'error' || /webgl|gl error|INVALID_/i.test(txt)) {
      if (m.type() === 'error' || /INVALID_|GL ERROR/i.test(txt)) errors.push(txt);
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'pl');
    localStorage.setItem(
      'f2-settings',
      JSON.stringify({
        debugOverlay: true,
        defaultZoom: 1,
        graphicsPreset: 'wysoki',
        postFx: true,
        lighting: true,
      }),
    );
  });
  await openMapScreen(page);
  await openMap(page, MAP);
  await page.waitForTimeout(1500);
  const plan = await page.evaluate(
    () =>
      (
        window as unknown as {
          __f2game: { gfx: { current: { active: boolean; lighting: boolean; preset: string } } };
        }
      ).__f2game.gfx.current,
  );
  expect(plan.active).toBe(true);
  expect(plan.lighting).toBe(true);
  expect(plan.preset).toBe('wysoki');
  expect(await game(page, (g) => g.batch.count)).toBeGreaterThan(0);
  const glErr = await page.evaluate(() => {
    const c = document.querySelector('canvas') as HTMLCanvasElement | null;
    const gl = c?.getContext('webgl2');
    return gl ? gl.getError() : -1;
  });
  expect([0, -1]).toContain(glErr);
  expect(errors).toEqual([]);
}

test('grafika wysoki + postFx + oswietlenie: desktop bez bledow GL', async ({ page }) => {
  test.setTimeout(240_000);
  await run(page);
});

test.describe('telefon 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  test('grafika wysoki + postFx + oswietlenie: mobile bez bledow GL', async ({ page }) => {
    test.setTimeout(240_000);
    await run(page);
  });
});
