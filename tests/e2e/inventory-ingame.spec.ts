import { expect, test } from '@playwright/test';
import { GAME_DIR, collectErrors } from './helpers';
import { game } from './map-helpers';
import { openCursorMenu, spawnStimpakAndWeapon, startNewGame } from './m4-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

interface WorldLike {
  world: {
    player: { hex: number; elevation: number; inventory: unknown[] };
    map: {
      objects: Array<{ type: number; hex: number; hidden?: boolean; proto: { kind: string } }>;
    };
  };
}

test.describe('inwentarz w grze', () => {
  test('przycisk i klawisz I otwieraja ekwipunek; podniesienie przedmiotu z mapy trafia do plecaka', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    await startNewGame(page);

    await page.getByTestId('inv-open').click();
    await expect(page.getByTestId('inventory-screen')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('inventory-screen')).toHaveCount(0);
    await page.keyboard.press('i');
    await expect(page.getByTestId('inventory-screen')).toBeVisible();
    await page.keyboard.press('i');
    await expect(page.getByTestId('inventory-screen')).toHaveCount(0);

    // ARTEMPLE nie ma przedmiotow na ziemi: kladziemy stimpak obok gracza (gracz stoi przy nim)
    const spawned = await spawnStimpakAndWeapon(page);
    const found = spawned.stim;
    const before = await game(
      page,
      (g) => (g as unknown as { session: WorldLike }).session.world.player.inventory.length,
    );
    const pt = await page.evaluate(
      (h) =>
        (
          window as unknown as { __f2game: { hexToClient(h: number): { x: number; y: number } } }
        ).__f2game.hexToClient(h),
      found,
    );
    // pickup przez menu kursora (PPM -> Podnies); lewy klik tylko prowadzi postac
    await openCursorMenu(page, pt.x, pt.y);
    await page.getByTestId('menu-pickup').click();
    await expect
      .poll(() =>
        game(
          page,
          (g) => (g as unknown as { session: WorldLike }).session.world.player.inventory.length,
        ),
      )
      .toBeGreaterThan(before);
    expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
  });
});
