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

async function longPress(page: Page, cdp: CDPSession, x: number, y: number): Promise<void> {
  await touch(cdp, 'touchStart', [{ x, y, id: 1 }]);
  await page.waitForTimeout(500);
  await touch(cdp, 'touchEnd', []);
}

/**
 * Dwa szybkie stukniecia dotykiem z jawnymi znacznikami czasu (CDP `timestamp`, sekundy): odstep miedzy
 * nimi jest deterministyczny i nie zalezy od obciazenia maszyny testowej (kolejka CDP/glowny watek
 * moze dodac setki ms, a rozpoznanie double tap ma okno 300 ms wg znacznikow zdarzen).
 */
async function doubleTap(cdp: CDPSession, x: number, y: number, gapMs = 120): Promise<void> {
  const t0 = Date.now() / 1000;
  const pt = [{ x, y, id: 1 }];
  const send = (type: 'touchStart' | 'touchEnd', at: number): Promise<unknown> =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : pt,
      timestamp: at,
    });
  await send('touchStart', t0);
  await send('touchEnd', t0 + 0.03);
  await send('touchStart', t0 + gapMs / 1000);
  await send('touchEnd', t0 + gapMs / 1000 + 0.03);
}

async function setup(page: Page): Promise<void> {
  await presetStorage(page, 1);
  await openMapScreen(page);
  await openMap(page, 'ARTEMPLE');
}

test('dotyk: long press otwiera menu radialne z duzymi celami, wybor chodu rusza postac', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await setup(page);
  const cdp = await page.context().newCDPSession(page);

  const target = await game(page, (g) => g.openHexAt(3));
  expect(target).toBeGreaterThanOrEqual(0);
  const pt = await game(page, (g) => g.hexToClient(g.openHexAt(3)));

  await longPress(page, cdp, pt.x, pt.y);
  const menu = page.getByTestId('map-menu');
  await expect(menu).toBeVisible();
  // postac nie ruszyla sie od samego long pressa
  expect(await game(page, (g) => g.view.player.value.moving)).toBe(false);

  // cele dotykowe >= 44 px (projekt: 56) i w obrebie ekranu
  const vp = page.viewportSize()!;
  for (const id of ['menu-walk', 'menu-run', 'menu-cancel']) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vp.width);
    expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
  }

  await page.getByTestId('menu-walk').tap();
  await expect(menu).toBeHidden();
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
  expect(errors, 'bledy konsoli').toEqual([]);
});

test('dotyk: anuluj i tap poza menu zamykaja je bez ruchu; double tap = patrz', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await setup(page);
  const cdp = await page.context().newCDPSession(page);
  const pt = await game(page, (g) => g.hexToClient(g.openHexAt(3)));
  const start = await game(page, (g) => g.player.hex);

  await longPress(page, cdp, pt.x, pt.y);
  await expect(page.getByTestId('map-menu')).toBeVisible();
  await page.getByTestId('menu-cancel').tap();
  await expect(page.getByTestId('map-menu')).toBeHidden();

  // tap poza menu: zamyka menu, nie rusza postaci
  await longPress(page, cdp, pt.x, pt.y);
  await expect(page.getByTestId('map-menu')).toBeVisible();
  const box = (await page.getByTestId('map-stage').boundingBox())!;
  await page.touchscreen.tap(box.x + 6, box.y + box.height - 6);
  await expect(page.getByTestId('map-menu')).toBeHidden();
  await page.waitForTimeout(400);
  expect(await game(page, (g) => g.player.hex)).toBe(start);
  expect(await game(page, (g) => g.view.player.value.moving)).toBe(false);

  // double tap = patrz: pojawia sie komunikat "look.*"
  await doubleTap(cdp, pt.x, pt.y);
  await page.waitForFunction(
    () => {
      const g = (
        window as unknown as { __f2game: { view: { notifications: { value: string[] } } } }
      ).__f2game;
      return g.view.notifications.value.some((m) => /Widzisz|Nic ciekawego/.test(m));
    },
    undefined,
    { timeout: 10_000 },
  );
  expect(errors, 'bledy konsoli').toEqual([]);
});

test('dotyk: przyciski HUD mapy maja co najmniej 44 px', async ({ page }) => {
  test.setTimeout(240_000);
  await setup(page);
  for (const id of ['zoom-in', 'zoom-out', 'elevation-up', 'elevation-down', 'map-back']) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.width, id).toBeGreaterThanOrEqual(44);
    expect(b.height, id).toBeGreaterThanOrEqual(44);
  }
});

test('dotyk: long-press-drag zamyka menu i prowadzi postac za palcem', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await setup(page);
  const cdp = await page.context().newCDPSession(page);
  const hex = await game(page, (g) => g.openHexAt(3));
  const pt = await game(page, (g) => g.hexToClient(g.openHexAt(3)));
  const start = await game(page, (g) => g.player.hex);
  expect(hex).not.toBe(start);

  // przytrzymaj dluzej niz 350 ms (menu), potem przeciagnij na heks docelowy i puść
  const from = { x: pt.x - 30, y: pt.y };
  await touch(cdp, 'touchStart', [{ x: from.x, y: from.y, id: 1 }]);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('map-menu')).toBeVisible();
  await touch(cdp, 'touchMove', [{ x: pt.x, y: pt.y, id: 1 }]);
  await expect(page.getByTestId('map-menu')).toBeHidden();
  await touch(cdp, 'touchEnd', []);

  await expect
    .poll(async () => game(page, (g) => g.view.player.value.moving || g.player.hex), {
      timeout: 10_000,
    })
    .not.toBe(start);
  expect(errors, 'bledy konsoli').toEqual([]);
});
