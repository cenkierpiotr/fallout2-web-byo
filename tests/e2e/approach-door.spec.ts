import { expect, test, devices } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import { GAME_DIR } from './helpers';
import { game, openMap, openMapScreen, presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13'];
void _ignored;
test.use({ ...iphone });

declare const DOORHEX: number;

interface DoorHook {
  reachableDoor(min: number): { hex: number; open: boolean } | null;
  doorOpenAt(hex: number): boolean;
  centerOn(hex: number): void;
  hexToClient(hex: number): { x: number; y: number };
}

async function longPress(page: Page, cdp: CDPSession, x: number, y: number): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  await page.waitForTimeout(500);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const CANDIDATE_MAPS = ['KLAMALL', 'DENBUS1', 'NEWR1', 'VAULT13', 'ARTEMPLE', 'ARVILLAG'];

// fn jest serializowana do tekstu (nie ma domkniec), wiec heks wstawiamy literalnie w miejsce DOORHEX.
const hook = <T>(page: Page, fn: (g: DoorHook) => T, hex = -1): Promise<T> =>
  page.evaluate(
    `(${fn.toString().replaceAll('DOORHEX', String(hex))})(window.__f2game)`,
  ) as Promise<T>;

test('Uzyj na odleglych drzwiach: postac podchodzi i otwiera drzwi (bez Za daleko)', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await presetStorage(page, 1);
  let found: { hex: number; open: boolean } | null = null;
  // Kazda mapa po swiezym zaladowaniu: lista map znika po otwarciu mapy, wiec kolejny
  // klik w map-item na tej samej stronie wisialby bez limitu czasu (przyczyna wczesniejszego wiszenia).
  for (const name of CANDIDATE_MAPS) {
    if (found) break;
    await openMapScreen(page);
    // filtr: pozycja trafia na szczyt listy
    await page.getByTestId('map-search').fill(name);
    if ((await page.getByTestId(`map-item-${name}`).count()) === 0) continue;
    await openMap(page, name);
    found = await hook(page, (g) => g.reachableDoor(4));
  }
  test.skip(!found, 'brak odleglych, odblokowanych drzwi na testowanych mapach');
  const door = found!;
  expect(await hook(page, (g) => g.doorOpenAt(DOORHEX), door.hex)).toBe(door.open);

  await hook(page, (g) => g.centerOn(DOORHEX), door.hex);
  // na waskim ekranie HUD zaslania srodek mapy, a to tam centrujemy drzwi: przepuszczamy dotyk przez nakladke
  await page.addStyleTag({ content: '.map-hud{pointer-events:none !important}' });
  await page.waitForTimeout(800);
  const pt = await hook(page, (g) => g.hexToClient(DOORHEX), door.hex);
  const cdp = await page.context().newCDPSession(page);
  const before = await game(page, (g) => g.view.player.value.hex);
  await longPress(page, cdp, pt.x, pt.y);
  await page.getByTestId('map-menu').waitFor({ timeout: 15_000 });
  await page.getByTestId('menu-use').click();

  // postac rusza sama
  await expect
    .poll(() => game(page, (g) => g.view.player.value.hex), { timeout: 20_000 })
    .not.toBe(before);
  // i po dojsciu zmienia stan drzwi
  await expect
    .poll(() => hook(page, (g) => g.doorOpenAt(DOORHEX), door.hex), { timeout: 60_000 })
    .toBe(!door.open);
  const notes = await game(page, (g) => g.view.notifications.value);
  expect(notes.join(' ')).not.toMatch(/Za daleko/i);
});
