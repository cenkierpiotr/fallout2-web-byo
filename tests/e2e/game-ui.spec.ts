import { expect, test, type Locator, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors } from './helpers';
import { openMap, openMapScreen, presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

interface G {
  player: { hex: number };
  commands: { moveTo(h: number): { ok: boolean } };
  openHexAt(n: number): number;
  view: { player: { value: { moving: boolean } } };
  session: {
    world: { clock: { ticks: number } };
    openBarter(m: unknown, o?: unknown): unknown;
  };
}

/** Zamyka otwarte okno przyciskiem X (Escape dziala tylko z fokusem w oknie). */
const closeModal = (page: Page, press: (l: Locator) => Promise<void>) =>
  press(page.getByRole('dialog').locator('[aria-label="Zamknij"]'));

const err = (e: string[]) => e.filter((x) => !/favicon|swiftshader|GPU stall/i.test(x));

test.describe('Ekrany @f2/ui w grze (zapisy, odpoczynek, handel)', () => {
  test('zapis z miniatura, odpoczynek, handel, wczytanie przez UI', async ({ page }, info) => {
    test.setTimeout(240_000);
    const touch = info.project.name.endsWith('mobile');
    const press = (l: Locator) => (touch ? l.tap() : l.click());
    const errors = collectErrors(page);
    await presetStorage(page, 2);
    await openMapScreen(page);
    await openMap(page, 'ARTEMPLE');
    const startHex = await page.evaluate(
      () => (window as unknown as { __f2game: G }).__f2game.player.hex,
    );

    // zapis do slotu 1 z miniatura
    await press(page.getByTestId('open-saves'));
    const card = page.locator('[data-testid=save-card][data-slot="manual-0"]');
    await expect(card).toHaveAttribute('data-empty', 'true');
    await press(card.getByRole('button', { name: 'Zapisz: Slot 1' }));
    await expect(card).toHaveAttribute('data-empty', 'false', { timeout: 30_000 });
    await expect(card.locator('[data-testid=save-thumb] img')).toBeVisible();
    await closeModal(page, press);
    await expect(page.getByTestId('saves-screen')).toHaveCount(0);

    // odpoczynek: godzina do przodu
    const t0 = await page.evaluate(
      () => (window as unknown as { __f2game: G }).__f2game.session.world.clock.ticks,
    );
    if (touch) await press(page.getByTestId('hud-rest'));
    else await page.keyboard.press('r');
    await expect(page.getByTestId('rest-screen')).toBeVisible();
    await press(page.getByTestId('rest-mode-h1'));
    await expect(page.getByTestId('rest-result')).toBeVisible();
    const t1 = await page.evaluate(
      () => (window as unknown as { __f2game: G }).__f2game.session.world.clock.ticks,
    );
    expect(t1).toBeGreaterThan(t0 + 1000);
    await closeModal(page, press);
    await expect(page.getByTestId('rest-screen')).toHaveCount(0);

    // handel: brak kupca w poblizu daje komunikat, potem recznie otwarta sesja pokazuje ekran
    await press(page.getByTestId('open-trade'));
    const nobody = page.getByTestId('notifications');
    const hasMerchant = (await page.getByTestId('barter-screen').count()) > 0;
    if (!hasMerchant) await expect(nobody).toContainText('Nikogo do handlu');
    else await closeModal(page, press);
    await page.evaluate(() => {
      const g = (window as unknown as { __f2game: G }).__f2game;
      const mk = (pid: number, qty: number) => ({
        id: pid,
        pid,
        fid: 0,
        type: 0,
        hex: -1,
        elevation: 0,
        rotation: 0,
        frame: 0,
        flags: 0,
        protoFlags: 0,
        scriptId: -1,
        localVars: new Int32Array(0),
        inventory: [],
        quantity: qty,
        proto: { kind: 'item', cost: 30, weight: 1, subtype: 5 },
        extra: { kind: 'item' },
        hidden: false,
      });
      g.session.openBarter(
        { ...mk(1, 1), type: 1, inventory: [mk(0x40, 1)] },
        { merchantName: 'Vic' },
      );
    });
    await expect(page.getByTestId('barter-screen')).toBeVisible();
    await closeModal(page, press);
    await expect(page.getByTestId('barter-screen')).toHaveCount(0);

    // ewentualny ruch wywolany klikniecia w tlo przy zamykaniu okna musi sie skonczyc
    await page.waitForFunction(
      () => !(window as unknown as { __f2game: G }).__f2game.view.player.value.moving,
    );

    // ruch, potem wczytanie slotu z ekranu zapisow
    await expect
      .poll(() =>
        page.evaluate(() => {
          const g = (window as unknown as { __f2game: G }).__f2game;
          const h = g.openHexAt(4);
          return h >= 0 && g.commands.moveTo(h).ok ? h : -1;
        }),
      )
      .toBeGreaterThanOrEqual(0);
    await page.waitForFunction(
      (h0) => {
        const g = (window as unknown as { __f2game: G }).__f2game;
        return g.player.hex !== h0 && !g.view.player.value.moving;
      },
      startHex,
      { timeout: 30_000 },
    );
    await press(page.getByTestId('open-saves'));
    await press(card.getByRole('button', { name: 'Wczytaj: Slot 1' }));
    await expect(page.getByTestId('saves-screen')).toHaveCount(0, { timeout: 30_000 });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __f2game: G }).__f2game.player.hex))
      .toBe(startHex);
    expect(err(errors)).toEqual([]);
  });
});
