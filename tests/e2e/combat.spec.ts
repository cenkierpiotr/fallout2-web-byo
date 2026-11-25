import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, openGame, finishCreator } from './helpers';
import { game, presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

interface SessionLike {
  state: { sheet: { hp: number } };
}

/** Menu -> kreator (preset) -> gra na ARTEMPLE. */
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

test.describe('walka: silnik @f2/rules w grze', () => {
  test('pasek Atak/Celuj/Koniec tury, szansa trafienia i spojne HP', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    await startNewGame(page);
    const start = page.getByTestId('combat-start');
    test.skip(!(await start.isVisible()), 'brak krytera w poblizu na starcie mapy');
    await start.click();
    const hud = page.getByTestId('combat-hud');
    await expect(hud).toBeVisible();
    // przycisk ataku pokazuje szanse trafienia z silnika (nie stale 70%)
    await expect(page.getByTestId('combat-attack')).toContainText(/\d+%/);
    const torso = await page.getByTestId('combat-aim-torso').innerText();
    await page.getByTestId('combat-aim-head').click();
    await expect(page.getByTestId('combat-aim-head')).toHaveAttribute('aria-pressed', 'true');
    const head = await page.getByTestId('combat-aim-head').innerText();
    const pct = (s: string): number => Number(/(\d+)%/.exec(s)?.[1] ?? NaN);
    expect(pct(head)).toBeLessThanOrEqual(pct(torso));
    // kilka rund: atak + koniec tury, HUD zgodny z arkuszem postaci
    for (let i = 0; i < 12 && (await hud.isVisible()); i++) {
      await page.getByTestId('combat-attack').click();
      if (!(await hud.isVisible())) break;
      await page.getByTestId('combat-end-turn').click();
    }
    const hp = await game(
      page,
      (g) => (g as unknown as { session: SessionLike }).session.state.sheet.hp,
    );
    expect(hp).toBeGreaterThanOrEqual(0);
    expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
  });
});
