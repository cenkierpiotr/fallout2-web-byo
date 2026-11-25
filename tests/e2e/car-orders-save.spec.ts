import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, openGame, finishCreator } from './helpers';
import { presetStorage } from './map-helpers';

/** Na mocno obciazonej maszynie: F2_E2E_TIMEOUT_MULT=3 (razem z F2_OPEN_TIMEOUT) wydluza limity czasu testow. */
const TIMEOUT_MULT = Number(process.env['F2_E2E_TIMEOUT_MULT'] ?? 1);

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

async function startNewGame(page: Page): Promise<void> {
  await presetStorage(page, 2);
  await page.addInitScript(() => localStorage.setItem('locale', 'pl'));
  await openGame(page);
  await page.getByTestId('tab-play').click();
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

for (const vp of [
  { name: 'desktop', width: 1280, height: 800 },
  { name: '390px', width: 390, height: 844 },
]) {
  test.describe(`samochod, rozkazy, zapis w walce (${vp.name})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('okno rozkazow otwiera sie i zamyka', async ({ page }) => {
      test.setTimeout(300_000 * TIMEOUT_MULT);
      const errors = collectErrors(page);
      await startNewGame(page);
      await page.getByTestId('orders-open').click();
      // bez towarzyszy: komunikat o pustej druzynie
      await expect(page.getByTestId('orders-empty')).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('panel auta: brak auta = brak panelu na mapie swiata', async ({ page }) => {
      test.setTimeout(300_000 * TIMEOUT_MULT);
      await startNewGame(page);
      await page.getByTestId('worldmap-open').click();
      await expect(page.getByTestId('worldmap-screen')).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId('worldmap-car-open')).toHaveCount(0);
    });

    test('F5 w trakcie walki jest zablokowany komunikatem', async ({ page }) => {
      test.setTimeout(300_000 * TIMEOUT_MULT);
      await startNewGame(page);
      await page.getByTestId('combat-start').click();
      // F5 obsluguje wrap mapy (tabIndex 0): ustaw fokus, jezyk UI zalezy od przegladarki
      await page.evaluate(() => {
        const w = document.querySelector('canvas')?.closest<HTMLElement>('[tabindex="0"]');
        w?.focus();
      });
      await page.keyboard.press('F5');
      await expect(
        page
          .getByTestId('notifications')
          .getByText(/Nie można zapisać gry w trakcie walki\.|You cannot save during combat\./),
      ).toBeVisible({
        timeout: 10_000,
      });
    });
  });
}
