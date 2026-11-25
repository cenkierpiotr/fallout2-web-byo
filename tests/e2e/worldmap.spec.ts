import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, openGame, finishCreator } from './helpers';
import { presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

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

test.describe('mapa swiata', () => {
  test('otwarcie, ruch klikiem, wyjscie do gry i wejscie do lokacji', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    await startNewGame(page);

    await page.getByTestId('worldmap-open').click();
    await expect(page.getByTestId('worldmap-screen')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('worldmap-canvas')).toBeVisible();
    // gracz stoi w Arroyo (ARTEMPLE), znane jest przynajmniej to miejsce
    await expect(page.locator('[data-testid^=worldmap-city-]').first()).toBeVisible();

    const pos = (): Promise<{ x: number; y: number }> =>
      page.evaluate(() => {
        const m = (window as unknown as { __f2wm: { model: { x: number; y: number } } }).__f2wm
          .model;
        return { x: m.x, y: m.y };
      });
    const before = await pos();
    const box = (await page.getByTestId('worldmap-canvas').boundingBox())!;
    // klik 150 px swiata w prawo i w dol od gracza: okno widoku 450x443 w ramce 640x480 (22,21), przewiniecie z atrybutow canvas
    const sc = await page.getByTestId('worldmap-canvas').evaluate((el) => ({
      x: Number((el as HTMLElement).dataset['scrollX'] ?? 0),
      y: Number((el as HTMLElement).dataset['scrollY'] ?? 0),
    }));
    const cx = box.x + ((22 + before.x + 150 - sc.x) / 640) * box.width;
    const cy = box.y + ((21 + before.y + 100 - sc.y) / 480) * box.height;
    await page.mouse.click(cx, cy);
    await expect.poll(async () => (await pos()).x, { timeout: 30_000 }).toBeGreaterThan(before.x);

    // wyjscie do gry: wraca mapa lokalna, zegar gry poszedl do przodu
    await page.getByTestId('worldmap-exit').click();
    await expect(page.getByTestId('worldmap-screen')).toHaveCount(0);
    await expect(page.getByTestId('map-name')).toContainText(/ARTEMPLE/i);

    // ponowne otwarcie (skrot W) i wejscie do lokacji z miasta, w ktorym stoimy
    await page.keyboard.press('w');
    await expect(page.getByTestId('worldmap-screen')).toBeVisible();
    await page.locator('[data-testid^=worldmap-city-]').first().click();
    const enter = page.locator('[data-testid^=worldmap-enter-]').first();
    await expect(enter).toBeVisible({ timeout: 60_000 });
    await enter.click();
    await expect(page.getByTestId('worldmap-screen')).toHaveCount(0);
    await expect(page.getByTestId('map-name')).toContainText(/AR/i, { timeout: 90_000 });
    expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
  });
});
