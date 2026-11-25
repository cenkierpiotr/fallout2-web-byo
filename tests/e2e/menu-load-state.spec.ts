import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, openGame, finishCreator } from './helpers';
import { game, presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

/**
 * Zapis zrobiony w grze wczytuje sie z menu glownego po SWIEZYM otwarciu strony (nowa nawigacja, nowy
 * proces gry; IndexedDB zostaje): ta sama mapa, heks, inwentarz, zegar, stan mapy swiata (modData.worldmap);
 * zapis zrobiony na mapie swiata wraca na mape swiata.
 */

async function startNewGame(page: Page): Promise<void> {
  await presetStorage(page, 2);
  await page.addInitScript(() => localStorage.setItem('locale', 'pl'));
  await openGame(page);
  await page.getByTestId('tab-play').click();
  await expect(page.getByTestId('main-menu-screen')).toBeVisible();
  await page.getByTestId('menu-new').click();
  await expect(page.getByTestId('creator-screen')).toBeVisible({ timeout: 60_000 });
  await page
    .getByRole('button', { name: /Wybierz postać:/ })
    .first()
    .click();
  await finishCreator(page);
  await expect(page.getByTestId('game-shell')).toBeVisible();
  await expect(page.getByTestId('map-name')).toContainText(/ARTEMPLE/i, { timeout: 90_000 });
}

function onSession<T>(page: Page, body: string): Promise<T> {
  return page.evaluate(
    `(async () => { const s = window.__f2game.session; ${body} })()`,
  ) as Promise<T>;
}

interface Snap {
  map: string;
  hex: number;
  ticks: number;
  inv: string;
  wm: { x: number; y: number; fog: string } | null;
}

const snapshot = (page: Page): Promise<Snap> =>
  onSession<Snap>(
    page,
    `const p = s.world.player; const w = s.state.modData.worldmap;
     return { map: s.world.map.name, hex: p.hex, ticks: s.world.clock.ticks,
       inv: JSON.stringify(p.inventory.map(i => [i.pid, i.quantity ?? 1]).sort()),
       wm: w ? { x: w.x, y: w.y, fog: w.fog } : null };`,
  );

/** Swiezy start strony (nowa nawigacja) i wczytanie slotu z menu glownego, ekran "Wczytaj". */
async function reloadAndLoadFromMenu(page: Page, slot: string): Promise<void> {
  // Znany artefakt srodowiska e2e (ok. 1 na 3 przebiegi pod duzym obciazeniem): ponowne setInputFiles
  // na tej samej karcie bywa konczone NotFoundError przy odczycie pliku gry (blad `map-error` przy
  // tworzeniu ekranu mapy). Dotyczy otwarcia folderu, nie wczytywania zapisu, wiec powtarzamy cale
  // swieze otwarcie do 3 razy.
  for (let attempt = 1; attempt <= 3; attempt++) {
    await openGame(page);
    await page.getByTestId('tab-play').click();
    await expect(page.getByTestId('main-menu-screen')).toBeVisible();
    await page.getByTestId('menu-load').click();
    const card = page.locator(`[data-testid=save-card][data-slot="${slot}"]`);
    await expect(card).toHaveAttribute('data-empty', 'false', { timeout: 30_000 });
    await card.getByRole('button', { name: /^Wczytaj/ }).click();
    await expect(page.getByTestId('game-shell')).toBeVisible();
    const ok = page.getByTestId('map-name').or(page.getByTestId('worldmap-screen'));
    const bad = page.getByTestId('map-error');
    await expect(ok.or(bad).first()).toBeVisible({ timeout: 120_000 });
    if (await ok.first().isVisible()) return;
    if (attempt === 3)
      throw new Error('map-error po 3 swiezych otwarciach: ' + (await bad.innerText()));
  }
}

test.describe('wczytanie z menu po swiezym otwarciu strony', () => {
  test('mapa lokalna: mapa, heks, inwentarz, zegar, stan mapy swiata', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = collectErrors(page);
    await startNewGame(page);

    // stan do zapamietania: kapsle w inwentarzu, odpoczynek (zegar), mapa swiata otwarta i zamknieta (modData.worldmap)
    await onSession(
      page,
      `const sc = window.__f2game.scripts, w = s.world;
       const id = sc.createObject(0x29, w.player.hex, w.player.elevation, 0);
       sc.addMultObjsToInven(w.player.id, id, 777); s.rest({ hours: 2 }); return 1;`,
    );
    await page.getByTestId('worldmap-open').click();
    await expect(page.getByTestId('worldmap-screen')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('worldmap-exit').click();
    await expect(page.getByTestId('worldmap-screen')).toHaveCount(0);
    expect(await onSession(page, `return await s.save('manual-0');`)).toMatchObject({ ok: true });
    const saved = await snapshot(page);
    expect(saved.wm, 'zapis niesie stan mapy swiata').not.toBeNull();

    await reloadAndLoadFromMenu(page, 'manual-0');
    await expect(page.getByTestId('map-name')).toContainText(/ARTEMPLE/i, { timeout: 90_000 });
    await expect(page.getByTestId('worldmap-screen')).toHaveCount(0);
    await expect.poll(async () => (await snapshot(page)).inv, { timeout: 30_000 }).toBe(saved.inv);
    const back = await snapshot(page);
    expect(back.map).toBe(saved.map);
    expect(back.hex).toBe(saved.hex);
    // snapshot po zapisie moze minimalnie wyprzedzac zapis (zegar biegnie), stad modul
    expect(Math.abs(back.ticks - saved.ticks)).toBeLessThan(600);
    expect(back.wm).toEqual(saved.wm);
    expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
  });

  test('zapis zrobiony na mapie swiata wraca na mape swiata (pozycja i mgla)', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = collectErrors(page);
    await startNewGame(page);
    await page.getByTestId('worldmap-open').click();
    await expect(page.getByTestId('worldmap-screen')).toBeVisible({ timeout: 60_000 });

    // ruch klikiem, zatrzymanie, zapis przy otwartej mapie swiata
    const pos = (): Promise<{ x: number; y: number }> =>
      page.evaluate(() => {
        const m = (window as unknown as { __f2wm: { model: { x: number; y: number } } }).__f2wm
          .model;
        return { x: m.x, y: m.y };
      });
    const before = await pos();
    const box = (await page.getByTestId('worldmap-canvas').boundingBox())!;
    const sc = await page.getByTestId('worldmap-canvas').evaluate((el) => ({
      x: Number((el as HTMLElement).dataset['scrollX'] ?? 0),
      y: Number((el as HTMLElement).dataset['scrollY'] ?? 0),
    }));
    await page.mouse.click(
      box.x + ((22 + before.x + 150 - sc.x) / 640) * box.width,
      box.y + ((21 + before.y + 100 - sc.y) / 480) * box.height,
    );
    await expect.poll(async () => (await pos()).x, { timeout: 30_000 }).toBeGreaterThan(before.x);
    await page.getByTestId('worldmap-stop').click();
    const stopped = await pos();
    expect(await onSession(page, `return await s.save('manual-1');`)).toMatchObject({ ok: true });
    const saved = await snapshot(page);
    expect(saved.wm, 'zapis zrobiony na mapie swiata niesie biezaca pozycje').toMatchObject(
      stopped,
    );

    // wczytanie z menu po swiezym otwarciu strony: mapa swiata otwarta, pozycja i mgla zachowane
    await reloadAndLoadFromMenu(page, 'manual-1');
    await expect(page.getByTestId('worldmap-screen')).toBeVisible({ timeout: 90_000 });
    expect(await pos()).toEqual(stopped);
    expect((await snapshot(page)).wm).toMatchObject({ ...stopped, fog: saved.wm!.fog });

    // wyjscie wraca do mapy lokalnej tej samej lokacji
    await page.getByTestId('worldmap-exit').click();
    await expect(page.getByTestId('map-name')).toContainText(/ARTEMPLE/i);
    expect(await game(page, (g) => g.view.currentMap.value.name)).toBe('ARTEMPLE');
    expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
  });
});
