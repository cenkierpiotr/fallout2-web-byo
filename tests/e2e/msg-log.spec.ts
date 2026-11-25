import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors } from './helpers';
import { openCursorMenu, spawnLockedDoor, startNewGame } from './m4-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

const LOCKPICK = 9;

/** PPM na zamknietych drzwiach, Umiejetnosci, Wlamywanie: komunikat wyniku trafia do dziennika. */
async function useLockpick(page: Page): Promise<void> {
  const hex = await spawnLockedDoor(page);
  const pt = await page.evaluate(
    (h) =>
      (
        window as unknown as { __f2game: { hexToClient(h: number): { x: number; y: number } } }
      ).__f2game.hexToClient(h),
    hex,
  );
  await openCursorMenu(page, pt.x, pt.y);
  await page.getByTestId('menu-skills').click();
  await page.getByTestId(`menu-skill:${LOCKPICK}`).click();
}

test.describe('dziennik komunikatow', () => {
  test('desktop: wynik umiejetnosci i zdarzenia walki w okienku komunikatow', async ({
    page,
    isMobile,
  }) => {
    // na mobile dziennik jest domyslnie zwiniety (patrz test "mobile 390" nizej)
    test.skip(isMobile, 'scenariusz desktopowy: lista komunikatow zawsze rozwinieta');
    test.setTimeout(600_000);
    const errors = collectErrors(page);
    await startNewGame(page);
    const list = page.getByTestId('msg-log-list');
    await expect(list).toBeVisible();
    await useLockpick(page);
    await expect(list.locator('li')).not.toHaveCount(0);
    await expect(list.locator('li').last()).toContainText(/\S/);
    const start = page.getByTestId('combat-start');
    if (await start.isVisible()) {
      await start.click();
      const before = await list.locator('li').count();
      // atak moze zaczac sie od dojscia do wroga: kilka rund atak + koniec tury, az pojawi sie wpis
      const hud = page.getByTestId('combat-hud');
      for (let i = 0; i < 12 && (await hud.isVisible()); i++) {
        await page.getByTestId('combat-attack').click();
        if ((await list.locator('li').count()) > before) break;
        if (!(await hud.isVisible())) break;
        await page.getByTestId('combat-end-turn').click();
        if ((await list.locator('li').count()) > before) break;
      }
      await expect.poll(async () => list.locator('li').count()).toBeGreaterThan(before);
    }
    expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
  });

  test('mobile 390: dziennik zwiniety, rozwija sie i nie zaslania paska HUD', async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await startNewGame(page);
    const toggle = page.getByTestId('msg-log-toggle');
    const list = page.getByTestId('msg-log-list');
    await expect(toggle).toBeVisible();
    await expect(list).toBeHidden();
    await useLockpick(page);
    await toggle.click();
    await expect(list).toBeVisible();
    await expect(list.locator('li').last()).toContainText(/\S/);
    const box = await page.getByTestId('msg-log').boundingBox();
    const hud = await page.locator('.game-shell__hud').boundingBox();
    expect(box).not.toBeNull();
    expect(hud).not.toBeNull();
    // dziennik w calosci nad paskiem HUD i w obrebie ekranu
    expect(box!.y + box!.height).toBeLessThanOrEqual(hud!.y + 1);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await toggle.click();
    await expect(list).toBeHidden();
  });
});
