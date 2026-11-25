import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, openGame, finishCreator } from './helpers';
import { game, presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

interface SessionLike {
  state: { sheet: { hp: number; progress: { level: number } } };
  quickSave(): Promise<{ ok: boolean }>;
  quickLoad(): Promise<{ ok: boolean }>;
  world: { player: { hex: number } };
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

test.describe('pelny przeplyw: menu -> kreator -> mapa -> dialog -> walka -> zapis -> smierc', () => {
  test('przechodzi caly przeplyw na lokalnych danych gry', async ({ page }) => {
    test.setTimeout(420_000);
    const errors = collectErrors(page);
    await startNewGame(page);

    // dialog z Klintem (audio i glowa dzialaja w DialogScreen)
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
    const pt = await game(page, (g) => {
      const k = (g as unknown as { objectByScript(s: number): { hex: number } }).objectByScript(
        0x4000001,
      );
      return g.hexToClient(k.hex);
    });
    // profil dotykowy (mobile) ignoruje mysz: tam rozmowa startuje tapem
    if (test.info().project.name === 'mobile') await page.touchscreen.tap(pt.x, pt.y);
    else await page.mouse.click(pt.x, pt.y);
    await expect(page.getByTestId('dialog-screen')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('dialog-npc-text')).not.toHaveText('');
    await page.locator('[data-testid^=dialog-option-]').last().dispatchEvent('click');
    await page.keyboard.press('Escape');

    // zapis i odczyt: hp postaci z kreatora przetrwa
    const hp0 = await game(
      page,
      (g) => (g as unknown as { session: SessionLike }).session.state.sheet.hp,
    );
    expect(hp0).toBeGreaterThan(0);
    const saved = await game(page, (g) =>
      (g as unknown as { session: SessionLike }).session.quickSave(),
    );
    expect(saved.ok).toBe(true);
    const loaded = await game(page, (g) =>
      (g as unknown as { session: SessionLike }).session.quickLoad(),
    );
    expect(loaded.ok).toBe(true);

    // Pip-Boy otwiera sie klawiszem P i pokazuje status postaci
    await page.keyboard.press('p');
    await expect(page.getByText(/Narg|Mingan|Chitsa|Lvl|Poz/i).first()).toBeVisible();
    await page.keyboard.press('Escape');

    // walka (jesli sa krytery w poblizu): atak i koniec tury nie wywalaja gry
    const startBtn = page.getByTestId('combat-start');
    if (await startBtn.isVisible()) {
      await startBtn.click();
      if (await page.getByTestId('combat-hud').isVisible()) {
        await page.getByTestId('combat-attack').click();
        await page.getByTestId('combat-end-turn').click();
      }
    }

    // smierc: hp = 0 -> ekran smierci -> menu glowne
    await game(page, (g) => {
      (g as unknown as { session: SessionLike }).session.state.sheet.hp = 0;
    });
    await expect(page.getByTestId('death-screen')).toBeVisible({ timeout: 20_000 });
    expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
  });

  test('zakonczenie gry prowadzi do ekranu zakonczenia', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    await startNewGame(page);
    await page.getByTestId('shell-end').click();
    await expect(page.getByTestId('endgame-screen').or(page.getByTestId('credits-screen')).first())
      .toBeVisible({ timeout: 30_000 })
      .catch((e) => {
        throw new Error(`${e}\n${errors.join('\n')}`);
      });
  });
});

test.describe('zakonczenie i smierc wyzwalane ze skryptow VM', () => {
  test('metarule 13 (SIGNAL_END_GAME) prowadzi do ekranu zakonczenia', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    await startNewGame(page);
    await game(page, (g) => {
      (g as unknown as { scripts: { metarule(id: number): unknown } }).scripts.metarule(13);
    });
    await expect(page.getByTestId('endgame-screen').or(page.getByTestId('credits-screen')).first())
      .toBeVisible({ timeout: 30_000 })
      .catch((e) => {
        throw new Error(`${e}\n${errors.join('\n')}`);
      });
  });

  test('kill_critter na graczu prowadzi do ekranu smierci', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    await startNewGame(page);
    await game(page, (g) => {
      const x = g as unknown as {
        player: { id: number };
        scripts: { unsupported(op: string, a: unknown[]): unknown };
      };
      x.scripts.unsupported('kill_critter', [
        { t: 'obj', v: x.player.id },
        { t: 'int', v: 0 },
      ]);
    });
    await expect(page.getByTestId('death-screen'))
      .toBeVisible({ timeout: 30_000 })
      .catch((e) => {
        throw new Error(`${e}\n${errors.join('\n')}`);
      });
  });
});
