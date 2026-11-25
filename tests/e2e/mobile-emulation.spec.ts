import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, openGame } from './helpers';
import { game, openMap, openMapScreen, presetStorage } from './map-helpers';

/**
 * Emulacja urzadzen mobilnych (zamiast fizycznych telefonow), uruchamiana przez
 * `playwright.mobile.config.ts` na profilach WebKit i Chromium. Opis i ograniczenia:
 * dokumentacja techniczna Wspolne scenariusze dotykowe (bez CDP, wiec dzialaja tez w WebKit):
 * import bez FSA (webkitdirectory), menu, kreator, mapa z chodzeniem, ekwipunek, dialog, walka, zapis/wczytanie.
 * Pomiary (czas klatki, pamiec, start) i throttling CPU/sieci: `mobile-perf.spec.ts` (tylko Chromium, CDP).
 */
test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

interface SessionLike {
  state: { sheet: { hp: number } };
  quickSave(): Promise<{ ok: boolean }>;
  quickLoad(): Promise<{ ok: boolean }>;
}

const RESULTS: Record<string, unknown> = {};

function record(step: string, value: unknown): void {
  RESULTS[step] = value;
}

test.afterAll(() => {
  const name = test.info().project.name;
  mkdirSync(join('test-results', 'mobile'), { recursive: true });
  writeFileSync(
    join('test-results', 'mobile', `flow-${name}.json`),
    JSON.stringify(RESULTS, null, 2),
  );
});

/** Tap w srodek elementu z prawdziwym hit-testem (przycisk zasloniety przez inny element = blad). */
async function tap(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).tap({ timeout: 20_000 });
}

test('import gry bez FSA: folder przez webkitdirectory (fallback), brak showDirectoryPicker', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // Safari/iOS nie ma File System Access API: wymuszamy ten sam stan takze w Chromium
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>)['showDirectoryPicker'];
  });
  const t0 = Date.now();
  await openGame(page);
  record('import_ms', Date.now() - t0);
  expect(await page.evaluate(() => 'showDirectoryPicker' in window)).toBe(false);
  record('opfs_api', await page.evaluate(() => !!navigator.storage?.getDirectory));
  expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
});

test('import gry: ZIP z folderem gry (nieprawidlowy ZIP daje czytelny blad, nie zawieszenie)', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('pick-zip-input').setInputFiles({
    name: 'zly.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('to nie jest archiwum zip'),
  });
  await expect(page.getByTestId('firstrun-error')).toBeVisible({ timeout: 30_000 });
});

test('przeplyw dotykowy: menu, kreator, mapa, ekwipunek, dialog, walka, zapis/wczytanie', async ({
  page,
  hasTouch,
}) => {
  test.skip(
    !hasTouch,
    'profil bez dotyku (Desktop Safari): przeplyw myszy pokrywaja testy desktop',
  );
  test.setTimeout(420_000);
  const errors = collectErrors(page);
  await presetStorage(page, 2);
  await page.addInitScript(() => localStorage.setItem('locale', 'pl'));
  await openGame(page);

  // menu
  await tap(page, 'tab-play');
  await expect(page.getByTestId('main-menu-screen')).toBeVisible();
  for (const id of ['menu-new', 'menu-load', 'menu-settings']) {
    await expect(page.getByTestId(id)).toBeVisible();
    const box = await page.getByTestId(id).boundingBox();
    // minimalny cel dotyku (WCAG 2.5.8: 24 px, zalecane 44 px)
    expect(box && box.height >= 24 && box.width >= 24).toBe(true);
  }

  // kreator
  await tap(page, 'menu-new');
  await expect(page.getByTestId('creator-screen')).toBeVisible({ timeout: 60_000 });
  await page
    .getByRole('button', { name: /Wybierz postać:/ })
    .first()
    .tap();
  const next = page.getByTestId('creator-screen').getByRole('button', { name: 'Dalej' });
  const finish = page.getByRole('button', { name: 'Zakończ i zacznij grę' });
  for (let i = 0; i < 5 && !(await finish.isVisible()); i++) await next.tap();
  await expect(finish).toBeEnabled();
  await finish.tap();
  await expect(page.getByTestId('game-shell')).toBeVisible();
  await expect(page.getByTestId('map-name')).toContainText(/ARTEMPLE/i, { timeout: 90_000 });

  // mapa: tap-to-walk
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
    { timeout: 30_000 },
  );

  // ekwipunek
  await tap(page, 'inv-open');
  await expect(page.getByTestId('inventory-screen')).toBeVisible();
  // na telefonie nie ma klawisza Escape: zamykamy przyciskiem modalu (dotyk)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Zamknij|Close/ })
    .first()
    .tap();
  await expect(page.getByTestId('inventory-screen')).toHaveCount(0);

  // dialog z Klintem
  const klint = await game(page, (g) => {
    const x = g as unknown as {
      objectByScript(s: number): { hex: number };
      placePlayerNear(h: number): boolean;
      centerOn(h: number): void;
    };
    const k = x.objectByScript(0x4000001);
    x.placePlayerNear(k.hex);
    x.centerOn(k.hex);
    return g.hexToClient(k.hex);
  });
  await page.touchscreen.tap(klint.x, klint.y);
  await expect(page.getByTestId('dialog-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('dialog-npc-text')).not.toHaveText('');
  const opt = page.locator('[data-testid^=dialog-option-]').last();
  const optBox = await opt.boundingBox();
  record('dialog_option_height_px', optBox?.height ?? null);
  await opt.dispatchEvent('click');
  await page
    .getByTestId('dialog-close')
    .first()
    .tap({ timeout: 5_000 })
    .catch(() => undefined);

  // zapis i wczytanie (przed walka: zapis w walce jest zablokowany regula gry)
  const hp0 = await game(
    page,
    (g) => (g as unknown as { session: SessionLike }).session.state.sheet.hp,
  );
  const saved = await game(page, (g) =>
    (g as unknown as { session: SessionLike }).session.quickSave(),
  );
  expect(saved, JSON.stringify(saved)).toMatchObject({ ok: true });
  const loaded = await game(page, (g) =>
    (g as unknown as { session: SessionLike }).session.quickLoad(),
  );
  expect(loaded.ok).toBe(true);
  const hp1 = await game(
    page,
    (g) => (g as unknown as { session: SessionLike }).session.state.sheet.hp,
  );
  expect(hp1).toBe(hp0);

  // walka (jesli w poblizu startu jest krytter)
  const start = page.getByTestId('combat-start');
  if (await start.isVisible()) {
    await start.tap();
    const hud = page.getByTestId('combat-hud');
    await expect(hud).toBeVisible();
    await expect(page.getByTestId('combat-attack')).toContainText(/\d+%/);
    for (let i = 0; i < 6 && (await hud.isVisible()); i++) {
      await page.getByTestId('combat-attack').tap();
      if (!(await hud.isVisible())) break;
      await page.getByTestId('combat-end-turn').tap();
    }
    record('combat', 'ok');
  } else {
    record('combat', 'brak krytera w poblizu startu (pominieto)');
  }

  // brak przewijania poziomego strony (typowy blad ukladu na waskim ekranie)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  record('horizontal_overflow_px', overflow);
  expect(overflow).toBeLessThanOrEqual(1);

  expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
});

test('mapa: tap, wczytanie mapy i render bez bledow konsoli', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await presetStorage(page, 1);
  await openMapScreen(page);
  await openMap(page, 'ARVILLAG');
  expect(await game(page, (g) => g.batch.count)).toBeGreaterThan(0);
  expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
});
