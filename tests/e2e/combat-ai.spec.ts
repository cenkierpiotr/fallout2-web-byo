import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, openGame, finishCreator } from './helpers';
import { game, presetStorage } from './map-helpers';

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

test.describe('walka: AI przeciwnikow z AI.TXT', () => {
  test('dane AI wczytane z gry, tury NPC bez bledow', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    await startNewGame(page);
    // AI.TXT i combatai.msg wczytane przez loadGameTables (rejestr danych walki)
    const loaded = await page.evaluate(async () => {
      const m = (await import(/* @vite-ignore */ '/src/game/combat-ai-data.ts')) as {
        getCombatAiData(): { ai: { size: number }; combatMsg: ReadonlyMap<number, string> } | null;
      };
      const d = m.getCombatAiData();
      return d ? { packets: d.ai.size, msgs: d.combatMsg.size } : null;
    });
    expect(loaded?.packets ?? 0).toBeGreaterThan(100);
    expect(loaded?.msgs ?? 0).toBeGreaterThan(100);
    const start = page.getByTestId('combat-start');
    test.skip(!(await start.isVisible()), 'brak krytera w poblizu na starcie mapy');
    await start.click();
    const hud = page.getByTestId('combat-hud');
    await expect(hud).toBeVisible();
    for (let i = 0; i < 10 && (await hud.isVisible()); i++) {
      await page.getByTestId('combat-end-turn').click();
    }
    const hp = await game(
      page,
      (g) =>
        (g as unknown as { session: { state: { sheet: { hp: number } } } }).session.state.sheet.hp,
    );
    expect(hp).toBeGreaterThanOrEqual(0);
    expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
  });
});
