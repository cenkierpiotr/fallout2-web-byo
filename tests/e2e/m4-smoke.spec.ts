import { expect, test } from '@playwright/test';
import { GAME_DIR, collectErrors } from './helpers';
import { game } from './map-helpers';
import { openCursorMenu, spawnLockedDoor, spawnStimpakAndWeapon, startNewGame } from './m4-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

interface Sess {
  state: { sheet: { hp: number; maxHp?: number } };
  world: { player: { inventory: unknown[] } };
}

/**
 * Dymny test M4-M5 w jednym przebiegu na prawdziwej grze: kreator, karta postaci, podniesienie
 * przedmiotow, ekwipunek (zalozenie broni, uzycie stimpaka), umiejetnosc Wlamywanie na zamknietych
 * drzwiach, awans po XP. Scena (przedmioty, drzwi) tworzona w locie, bo ARTEMPLE jej nie ma.
 */
test('M4 smoke: kreator, karta, ekwipunek, wlamywanie, awans', async ({ page }) => {
  test.setTimeout(900_000);
  const errors = collectErrors(page);

  // 1. kreator konczy sie wejsciem do gry
  await startNewGame(page);

  // 2. karta postaci: 7 SPECIAL i 18 umiejetnosci
  await page.getByTestId('char-open').click();
  await expect(page.getByTestId('character-screen')).toBeVisible();
  await expect(page.getByTestId('special-list').locator('li')).toHaveCount(7);
  await expect(page.getByTestId('skill-list').locator('li')).toHaveCount(18);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('character-screen')).toHaveCount(0);

  // 3. przedmioty na ziemi: stimpak i bron trafiaja do plecaka
  const sp = await spawnStimpakAndWeapon(page);
  expect(sp.weaponPid).toBeGreaterThan(0);
  const invLen = () =>
    game(page, (g) => (g as unknown as { session: Sess }).session.world.player.inventory.length);
  for (const hex of [sp.stim, sp.weapon]) {
    const before = await invLen();
    // podnoszenie dziala w zasiegu 2: stawiamy gracza przy przedmiocie
    await page.evaluate((h) => {
      const g = (
        window as unknown as {
          __f2game: { centerOn(h: number): void; placePlayerNear(h: number): boolean };
        }
      ).__f2game;
      g.placePlayerNear(h);
      g.centerOn(h);
    }, hex);
    const pt = await page.evaluate(
      (h) =>
        (
          window as unknown as { __f2game: { hexToClient(h: number): { x: number; y: number } } }
        ).__f2game.hexToClient(h),
      hex,
    );
    // pickup przez menu kursora (PPM -> Podnies); lewy klik tylko prowadzi postac
    await openCursorMenu(page, pt.x, pt.y);
    await page.getByTestId('menu-pickup').click();
    await expect.poll(invLen, { timeout: 60_000 }).toBeGreaterThan(before);
  }

  // 4. ekwipunek: zalozenie broni do reki, uzycie stimpaka podnosi HP
  await page.keyboard.press('i');
  await expect(page.getByTestId('inventory-screen')).toBeVisible();
  const items = page.locator('[data-testid=inv-item]');
  await expect.poll(() => items.count()).toBeGreaterThanOrEqual(2);
  let equipped = false;
  let used = false;
  await game(page, (g) => {
    const s = (g as unknown as { session: Sess }).session.state.sheet;
    s.hp = Math.max(1, s.hp - 5);
  });
  const hpBefore = await game(
    page,
    (g) => (g as unknown as { session: Sess }).session.state.sheet.hp,
  );
  for (let i = 0; i < 4 && !(equipped && used); i++) {
    const n = await items.count();
    if (i >= n) break;
    await items.nth(i).click();
    const eq = page.getByRole('button', { name: /^Do prawej ręki$/ });
    const use = page.getByRole('button', { name: /^Użyj$/ });
    if (!equipped && (await eq.isVisible().catch(() => false))) {
      await eq.click();
      equipped = true;
    } else if (!used && (await use.isVisible().catch(() => false))) {
      await use.click();
      used = true;
    }
  }
  expect(equipped, 'bron zalozona z UI').toBe(true);
  expect(used, 'stimpak uzyty z UI').toBe(true);
  await expect
    .poll(() => game(page, (g) => (g as unknown as { session: Sess }).session.state.sheet.hp))
    .toBeGreaterThan(hpBefore);
  await page.keyboard.press('i');
  await expect(page.getByTestId('inventory-screen')).toHaveCount(0);

  // 5. umiejetnosc Wlamywanie na zamknietych drzwiach, z procentem w menu (ADR-0013)
  const door = await spawnLockedDoor(page);
  const pt = await page.evaluate(
    (h) =>
      (
        window as unknown as { __f2game: { hexToClient(h: number): { x: number; y: number } } }
      ).__f2game.hexToClient(h),
    door,
  );
  await openCursorMenu(page, pt.x, pt.y);
  await page.getByTestId('menu-skills').click();
  const lock = page.getByTestId('menu-skill:9');
  await expect(lock).toBeVisible();
  await expect(lock).toContainText(/\d+\s*%/);
  const notes = page.getByTestId('notifications').locator('li');
  const nBefore = await notes.count();
  await lock.click();
  await expect(notes).not.toHaveCount(nBefore);

  // 6. awans po XP otwiera karte z arkuszem awansu
  await page.evaluate(() => {
    (
      window as unknown as { __f2CharacterHost?: { awardKill(xp: number, k: number): void } }
    ).__f2CharacterHost?.awardKill(2000, 0);
  });
  await expect(page.getByTestId('character-screen')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('char-level')).not.toContainText(/^Poziom 1$/);

  expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
});
