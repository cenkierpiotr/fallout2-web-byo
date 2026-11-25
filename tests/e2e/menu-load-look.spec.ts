import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, openGame, finishCreator } from './helpers';
import { game, presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

interface SessionLike {
  state: { sheet: { hp: number } };
  save(slot: string): Promise<{ ok: boolean }>;
  world: { player: { hex: number } };
}

async function startNewGame(page: Page): Promise<void> {
  await presetStorage(page, 2);
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

test.describe('menu: wczytywanie zapisow i akcja Patrz z pro_*.msg', () => {
  test('zapis z gry jest widoczny w menu (miniatura) i da sie go wczytac', async ({ page }) => {
    test.setTimeout(420_000);
    const errors = collectErrors(page);
    await startNewGame(page);
    const hp = await game(
      page,
      (g) => (g as unknown as { session: SessionLike }).session.state.sheet.hp,
    );
    const saved = await game(page, (g) =>
      (g as unknown as { session: SessionLike }).session.save('manual-0'),
    );
    expect(saved.ok).toBe(true);

    // smierc -> menu glowne
    await game(page, (g) => {
      (g as unknown as { session: SessionLike }).session.state.sheet.hp = 0;
    });
    await expect(page.getByTestId('death-screen')).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('x');
    await expect(page.getByTestId('main-menu-screen')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('menu-load-last')).toBeVisible();

    // lista zapisow z miniatura, bez przyciskow zapisu
    await page.getByTestId('menu-load').click();
    const card = page.locator('[data-testid=save-card][data-slot="manual-0"]');
    await expect(card).toHaveAttribute('data-empty', 'false');
    await expect(card.locator('[data-testid=save-thumb] img')).toBeVisible();
    await expect(card.getByRole('button', { name: /^Zapisz/ })).toHaveCount(0);
    await card.getByRole('button', { name: /^Wczytaj/ }).click();

    await expect(page.getByTestId('game-shell')).toBeVisible();
    await expect(page.getByTestId('map-name')).toContainText(/ARTEMPLE/i, { timeout: 90_000 });
    await expect
      .poll(
        () => game(page, (g) => (g as unknown as { session: SessionLike }).session.state.sheet.hp),
        {
          timeout: 30_000,
        },
      )
      .toBe(hp);
    expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
  });

  test('Patrz pokazuje nazwe z pro_crit.msg i przelacza sie PL/EN', async ({ page }) => {
    test.setTimeout(300_000);
    await startNewGame(page);
    await game(page, (g) => {
      const x = g as unknown as {
        objectByScript(s: number): { hex: number };
        placePlayerNear(h: number): boolean;
        centerOn(h: number): void;
      };
      const k = x.objectByScript(0x4000001);
      x.placePlayerNear(k.hex);
      x.centerOn(k.hex);
    });
    // profil dotykowy ignoruje mysz (PPM): menu akcji otwiera long press prawdziwym dotykiem (CDP)
    const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
    const cdp = coarse ? await page.context().newCDPSession(page) : null;
    const look = async (): Promise<string> => {
      // Klint potrafi sie ruszyc miedzy kolejnymi Patrz: pozycje liczymy za kazdym razem
      const pt = await game(page, (g) => {
        const x = g as unknown as {
          objectByScript(s: number): { hex: number };
          centerOn(h: number): void;
        };
        const hex = x.objectByScript(0x4000001).hex;
        x.centerOn(hex);
        return g.hexToClient(hex);
      });
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: pt.x, y: pt.y, id: 1 }],
        });
        await page.waitForTimeout(500);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else await page.mouse.click(pt.x, pt.y, { button: 'right' });
      await page.getByTestId('menu-look').click();
      const notes = page.getByTestId('notifications');
      await expect(notes.locator('li').last()).not.toHaveText('');
      return (await notes.locator('li').last().textContent()) ?? '';
    };
    await page.getByTestId('lang-en').dispatchEvent('click');
    const en = await look();
    await page.getByTestId('lang-pl').dispatchEvent('click');
    const pl = await look();
    // nazwa konkretnego krytera (nie ogolny komunikat "Widzisz stworzenie")
    expect(en).not.toMatch(/^You see a creature/);
    expect(pl).not.toMatch(/^Widzisz stworzenie/);
    // Klint ma wlasny look_at_p_proc: gra pokazuje tekst ze skryptu (imie), nie ogolna nazwe z pro_crit.msg
    expect(en).toMatch(/Klint/i);
    expect(pl).not.toBe(en);
  });
});
