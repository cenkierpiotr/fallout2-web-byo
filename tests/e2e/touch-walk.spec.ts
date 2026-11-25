import { expect, test, devices } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { GAME_DIR, collectErrors } from './helpers';
import { game, openMap, openMapScreen, presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13'];
void _ignored;
test.use({ ...iphone });

async function touch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  pts: Array<{ x: number; y: number; id: number }>,
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : pts.map((p) => ({ x: p.x, y: p.y, id: p.id })),
  });
}

async function setup(page: Page): Promise<void> {
  await presetStorage(page, 1);
  await openMapScreen(page);
  await openMap(page, 'ARTEMPLE');
}

test('dotyk: tap, pinch, pan dwoma palcami', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await setup(page);

  // tap na heks
  const target = await game(page, (g) => g.openHexAt(3));
  expect(target).toBeGreaterThanOrEqual(0);
  const pt = await game(page, (g) => g.hexToClient(g.openHexAt(3)));
  await page.touchscreen.tap(pt.x, pt.y);
  await page.waitForFunction(
    (h) => {
      const g = (
        window as unknown as {
          __f2game: { view: { player: { value: { hex: number; moving: boolean } } } };
        }
      ).__f2game;
      return g.view.player.value.hex === h && !g.view.player.value.moving;
    },
    target,
    { timeout: 20_000 },
  );

  const cdp = await page.context().newCDPSession(page);
  const box = (await page.getByTestId('map-stage').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // pinch: rozsuwanie palcow zwieksza zoom
  const z0 = await game(page, (g) => g.iso.zoom);
  await touch(cdp, 'touchStart', [
    { x: cx - 30, y: cy, id: 1 },
    { x: cx + 30, y: cy, id: 2 },
  ]);
  for (let i = 1; i <= 10; i++) {
    await touch(cdp, 'touchMove', [
      { x: cx - 30 - i * 8, y: cy, id: 1 },
      { x: cx + 30 + i * 8, y: cy, id: 2 },
    ]);
  }
  await touch(cdp, 'touchEnd', []);
  const z1 = await game(page, (g) => g.iso.zoom);
  expect(z1).toBeGreaterThan(z0);

  // pan dwoma palcami: kamera sie przesuwa
  const c0 = await game(page, (g) => ({ x: g.iso.x, y: g.iso.y }));
  await touch(cdp, 'touchStart', [
    { x: cx - 20, y: cy, id: 1 },
    { x: cx + 20, y: cy, id: 2 },
  ]);
  for (let i = 1; i <= 10; i++) {
    await touch(cdp, 'touchMove', [
      { x: cx - 20 + i * 10, y: cy + i * 6, id: 1 },
      { x: cx + 20 + i * 10, y: cy + i * 6, id: 2 },
    ]);
  }
  await touch(cdp, 'touchEnd', []);
  const c1 = await game(page, (g) => ({ x: g.iso.x, y: g.iso.y }));
  expect(Math.hypot(c1.x - c0.x, c1.y - c0.y)).toBeGreaterThan(5);
  expect(errors, 'bledy konsoli').toEqual([]);
});
