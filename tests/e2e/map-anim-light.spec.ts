import { expect, test } from '@playwright/test';
import { GAME_DIR, collectErrors } from './helpers';
import { game, openMap, openMapScreen, presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

interface Dbg {
  player: { id: number };
  lighting: { ambient(): number; tileLight(t: number): number; refresh(): void };
  animView(id: number): { anim: number; frame: number } | undefined;
  playAnim(id: number, anim: number): Promise<void>;
  commands: { moveTo(hex: number, run?: boolean): unknown } | null;
  openHexAt(d: number): number;
  view: { player: { value: { hex: number; moving: boolean } } };
}

test.describe('animacje krytera i swiatlo', () => {
  test('chod z AnimDirector, unik i swiatlo otoczenia', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    await presetStorage(page, 2);
    await openMapScreen(page);
    await openMap(page, 'ARTEMPLE');

    // swiatlo: ambient w zakresie 0.25..1, kafle nie ciemniejsze niz ambient
    const amb = await game(page, (g) => (g as unknown as Dbg).lighting.ambient());
    expect(amb).toBeGreaterThanOrEqual(0.25);
    expect(amb).toBeLessThanOrEqual(1);
    const tl = await game(page, (g) => (g as unknown as Dbg).lighting.tileLight(5050));
    expect(tl).toBeGreaterThanOrEqual(amb - 1e-6);

    // chod: w trakcie marszu widok AnimDirector to Walk (1) albo Running (19)
    // na waskim ekranie (mobile) widoczny jest mniejszy obszar: najdalszy osiagalny heks z zakresu 8..4
    const target = await game(page, (g) => {
      for (let d = 8; d >= 4; d--) {
        const h = g.openHexAt(d);
        if (h >= 0) return h;
      }
      return -1;
    });
    expect(target).toBeGreaterThanOrEqual(0);
    await page.evaluate(
      (h) => (window as unknown as { __f2game: Dbg }).__f2game.commands?.moveTo(h, false),
      target,
    );
    await page.waitForFunction(
      () => {
        const g = (window as unknown as { __f2game: Dbg }).__f2game;
        const v = g.animView(g.player.id);
        return !!v && (v.anim === 1 || v.anim === 19);
      },
      undefined,
      { timeout: 10_000 },
    );
    await page.waitForFunction(
      (h) => {
        const g = (window as unknown as { __f2game: Dbg }).__f2game;
        return g.view.player.value.hex === h && !g.view.player.value.moving;
      },
      target,
      { timeout: 20_000 },
    );
    // po zatrzymaniu wraca do stania (brak widoku)
    await page.waitForFunction(
      () => {
        const g = (window as unknown as { __f2game: Dbg }).__f2game;
        return g.animView(g.player.id) === undefined;
      },
      undefined,
      { timeout: 5000 },
    );

    // unik gracza (13) gra klip i konczy bez bledow
    await game(page, (g) => (g as unknown as Dbg).playAnim(g.player.id as never, 13));
    const dodge = await game(page, (g) =>
      (g as unknown as Dbg).animView((g as unknown as Dbg).player.id),
    );
    expect(dodge === undefined || dodge.anim === 13).toBe(true);
    expect(errors.filter((e) => !/favicon/i.test(e))).toEqual([]);
  });
});
