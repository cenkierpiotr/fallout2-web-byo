import { expect, test } from '@playwright/test';
import { GAME_DIR, collectErrors } from './helpers';
import { openCursorMenu, spawnLockedDoor, startNewGame } from './m4-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

const LOCKPICK = 9;

/**
 * ARTEMPLE nie ma obiektow z umiejetnosciami w widoku startowym, wiec scene ustawiamy sami:
 * zamkniete na klucz drzwi tworzone w locie obok gracza (m4-helpers.spawnLockedDoor).
 */
test.describe('skille na obiektach z menu kursora', () => {
  test('PPM na zamknietych drzwiach: Umiejetnosci, Wlamywanie z procentem, komunikat', async ({
    page,
  }) => {
    test.setTimeout(600_000);
    const errors = collectErrors(page);
    await startNewGame(page);
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

    const lock = page.getByTestId(`menu-skill:${LOCKPICK}`);
    await expect(lock).toBeVisible();
    // ADR-0013: procent szansy widoczny domyslnie
    await expect(lock).toContainText(/\d+\s*%/);
    const before = await page.getByTestId('notifications').locator('li').count();
    await lock.click();
    await expect(page.getByTestId('notifications').locator('li')).not.toHaveCount(before);
    await expect(page.getByTestId('notifications').locator('li').last()).toContainText(/\S/);
    // spojnosc: bit zamkniecia i bit otwarcia nie moga byc ustawione naraz po probie
    const bits = await page.evaluate((h) => {
      const o = (
        window as unknown as {
          __f2game: {
            map: { objects: Array<{ hex: number; extra: { kind: string; raw: Int32Array } }> };
          };
        }
      ).__f2game.map.objects.find((q) => q.hex === h && q.extra.kind === 'door');
      return o ? o.extra.raw[0]! : -1;
    }, hex);
    expect(bits).toBeGreaterThanOrEqual(0);
    expect([0, 1, 2]).toContain(bits & 3);
    expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
  });
});
