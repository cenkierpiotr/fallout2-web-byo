import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, openGame, finishCreator } from './helpers';
import { presetStorage } from './map-helpers';

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

test.describe('postac w grze: skille, atuty, awans', () => {
  test('karta postaci z przycisku HUD pokazuje staty, skille i cechy', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    await startNewGame(page);
    await page.getByTestId('char-open').click();
    await expect(page.getByTestId('character-screen')).toBeVisible();
    await expect(page.getByTestId('special-list').locator('li')).toHaveCount(7);
    await expect(page.getByTestId('skill-list').locator('li')).toHaveCount(18);
    await expect(page.getByTestId('char-level')).toContainText('1');
    // Pierwsza pomoc / Skradanie dostepne jako uzycie skilla
    await expect(page.getByTestId('skill-use-6')).toBeVisible();
    await expect(page.getByTestId('skill-use-8')).toBeVisible();
    await page.getByTestId('skill-use-8').click();
    await expect(page.getByTestId('skill-note')).toBeVisible();
    expect(errors.filter((e) => !/favicon|404/.test(e))).toEqual([]);
  });

  test('awans po XP otwiera karte z arkuszem awansu', async ({ page }) => {
    test.setTimeout(300_000);
    await startNewGame(page);
    await page.evaluate(() => {
      const w = window as unknown as {
        __f2CharacterHost?: { awardKill(xp: number, k: number): void };
      };
      w.__f2CharacterHost?.awardKill(2000, 0);
    });
    await expect(page.getByTestId('character-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('char-level')).not.toContainText(/^Poziom 1$/);
  });
});
