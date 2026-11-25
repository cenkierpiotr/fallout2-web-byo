import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, finishCreator, openGame } from './helpers';
import { startNewGame } from './m4-helpers';
import { game, openMap, openMapScreen, presetStorage } from './map-helpers';

// Audyt axe-core ekranow prawdziwej aplikacji (nie playgroundu): menu, ustawienia, profile, diagnostyka,
// mapa (lista map), kreator, gra (mapa), ekwipunek, postac, Pip-Boy, mapa swiata, zapisy.
// Dialog NPC (Klint, ARTEMPLE) jest tu audytowany w prawdziwej aplikacji (desktop i mobile).
// Handel (gdialog_barter, rozmowa z Maida w Klamath) tez jest audytowany w prawdziwej aplikacji.
test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');
test.use({ actionTimeout: 30_000 });
/** Mnoznik limitow czasu na mocno obciazonej maszynie (kopiowanie plikow gry bywa wtedy wielokrotnie wolniejsze). */
const X = Number(process.env['F2_AXE_TIMEOUT_X'] ?? 1);

/** Kontrast na animowanych plotnach (canvas) i pelnoekranowym WebGL axe nie ocenia; pomijamy sam canvas. */
async function audit(page: Page, name: string, extra: string[] = []): Promise<void> {
  let b = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('canvas');
  for (const sel of extra) b = b.exclude(sel);
  const res = await b.analyze();
  const bad = res.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical');
  expect
    .soft(
      bad.map(
        (x) =>
          `${name} ${x.id} (${x.impact}): ${x.nodes
            .map((n) => n.target.join(' '))
            .slice(0, 4)
            .join(' | ')}`,
      ),
      `axe: ${name}`,
    )
    .toEqual([]);
}

const closeModal = async (page: Page): Promise<void> => {
  await page.keyboard.press('Escape');
  if (await page.locator('.f2-modal').count())
    await page.locator('.f2-modal').locator('[aria-label="Zamknij"]').first().click();
  await expect(page.locator('.f2-modal')).toHaveCount(0);
};

test.describe('axe: ekrany aplikacji', () => {
  test('menu, ustawienia, profile, diagnostyka, lista map', async ({ page }) => {
    test.setTimeout(240_000 * X);
    const errors = collectErrors(page);
    await presetStorage(page, 2);
    await openGame(page);
    await page.getByTestId('tab-maps').click();
    await expect(page.getByTestId('map-list')).toBeVisible({ timeout: 60_000 });
    await audit(page, 'lista-map');
    await page.getByTestId('tab-play').click();
    await expect(page.getByTestId('main-menu-screen')).toBeVisible();
    await audit(page, 'menu');

    await page.getByTestId('menu-settings').click();
    await expect(page.locator('.f2-modal[role="dialog"]')).toBeVisible();
    await audit(page, 'ustawienia');
    await closeModal(page);

    await page.getByTestId('profile-switch').click();
    await expect(page.getByTestId('profile-select')).toBeVisible();
    await audit(page, 'profile');
    await page.keyboard.press('Escape');

    await page.getByTestId('tab-diagnostics').click();
    await page.waitForTimeout(500);
    await audit(page, 'diagnostyka');
    expect(errors.filter((e) => !/favicon|swiftshader|GPU stall/i.test(e))).toEqual([]);
  });

  test('kreator, gra, ekwipunek, postac, Pip-Boy, mapa swiata, zapisy', async ({ page }) => {
    test.setTimeout(400_000 * X);
    await presetStorage(page, 2);
    await openGame(page);
    await page.getByTestId('tab-play').click();
    await page.getByTestId('menu-new').click();
    await expect(page.getByTestId('creator-screen')).toBeVisible({ timeout: 60_000 });
    await audit(page, 'kreator');
    await page
      .getByRole('button', { name: /Wybierz postać:/ })
      .first()
      .click();
    await finishCreator(page);
    await expect(page.getByTestId('game-shell')).toBeVisible();
    await expect(page.getByTestId('map-name')).toContainText(/ARTEMPLE/i, { timeout: 90_000 });
    await audit(page, 'gra-mapa');

    await page.getByTestId('inv-open').click();
    await expect(page.getByTestId('inventory-screen')).toBeVisible();
    await audit(page, 'ekwipunek');
    await closeModal(page);

    await page.getByTestId('char-open').click();
    await expect(page.getByTestId('character-screen')).toBeVisible();
    await audit(page, 'postac');
    await closeModal(page);

    await page.getByTestId('hud-pipboy').getByRole('button').click();
    await expect(page.locator('.f2-modal[role="dialog"]')).toBeVisible();
    await audit(page, 'pipboy');
    await closeModal(page);

    await page.getByTestId('worldmap-open').click();
    await expect(page.getByTestId('worldmap-screen')).toBeVisible({ timeout: 60_000 });
    await audit(page, 'mapa-swiata');
    await page.getByTestId('worldmap-exit').click();
    await expect(page.getByTestId('worldmap-screen')).toHaveCount(0);
  });

  test('zapisy w widoku mapy', async ({ page }) => {
    test.setTimeout(240_000 * X);
    await presetStorage(page, 2);
    await openGame(page);
    await page.getByTestId('tab-maps').click();
    await expect(page.getByTestId('map-list')).toBeVisible({ timeout: 60_000 });
    await page.getByTestId('map-item-ARTEMPLE').click();
    await page.getByTestId('open-saves').waitFor({ timeout: 90_000 });
    await page.getByTestId('open-saves').click();
    await expect(page.getByTestId('saves-screen')).toBeVisible();
    await audit(page, 'zapisy');
  });
});

test.describe('axe: dialog NPC w prawdziwej aplikacji', () => {
  test('dialog z Klintem (ARTEMPLE): axe, fokus, klawiatura', async ({ page }, info) => {
    test.setTimeout(300_000 * X);
    await presetStorage(page, 1);
    await openMapScreen(page);
    await openMap(page, 'ARTEMPLE');
    type G = {
      objectByScript(s: number): { hex: number };
      placePlayerNear(h: number): boolean;
      centerOn(h: number): void;
    };
    await game(page, (g) => {
      const k = (g as unknown as G).objectByScript(0x4000001);
      (g as unknown as G).placePlayerNear(k.hex);
    });
    await game(page, (g) => {
      const k = (g as unknown as G).objectByScript(0x4000001);
      (g as unknown as G).centerOn(k.hex);
    });
    const pt = await game(page, (g) =>
      g.hexToClient((g as unknown as G).objectByScript(0x4000001).hex),
    );
    if (info.project.name === 'mobile') await page.touchscreen.tap(pt.x, pt.y);
    else await page.mouse.click(pt.x, pt.y);

    const screen = page.getByTestId('dialog-screen');
    await expect(screen).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('dialog-npc-text')).not.toHaveText('');
    await audit(page, 'dialog-npc');

    // fokus startuje wewnatrz dialogu i Tab go nie opuszcza (pulapka fokusu)
    const inside = () =>
      page.evaluate(() => !!document.activeElement?.closest('[data-testid=dialog-screen]'));
    expect(await inside()).toBe(true);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await inside()).toBe(true);
    }
  });
});

test.describe('axe: handel w prawdziwej aplikacji', () => {
  test('handel z Maida (gdialog_barter): axe', async ({ page }) => {
    test.setTimeout(1_500_000 * X);
    await startNewGame(page);
    const tr = await page.evaluate(`(async () => window.__f2game.session.travelTo('kladwtwn'))()`);
    expect(tr, 'travelTo kladwtwn').toMatchObject({ ok: true });
    await expect
      .poll(() => page.evaluate(`window.__f2game.view.currentMap.value.name`), {
        timeout: 400_000 * X,
      })
      .toBe('KLADWTWN');
    // rozmowa z Maida (skrypt kcmaida), opcja "Tak, chcialbym z toba handlowac" otwiera handel
    const r = await page.evaluate(`(async () => {
      const g = window.__f2game; const w = g.session.world; const sc = g.scripts;
      const m = w.map.objects.find(o => o.scriptId !== -1 && sc.scheduler.get(o.scriptId)?.script.name === 'kcmaida');
      if (!m) return { err: 'no maida' };
      g.placePlayerNear(m.hex);
      g.commands.talkTo(m.id);
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 400));
        if (g.session.view.barter.value) return { opened: true };
        const d = g.view.dialog.value;
        if (!d) return { opened: false, closed: true, i };
        const vis = d.options.filter(o => o.visible);
        if (!vis.length) continue;
        const pick = vis.find(o => /handl|kupi|buy/i.test(o.text)) ?? vis[0];
        g.commands.dialog.choose(pick.index);
      }
      await new Promise(r => setTimeout(r, 400));
      return { opened: !!g.session.view.barter.value };
    })()`);
    expect(r, JSON.stringify(r)).toMatchObject({ opened: true });
    await expect(page.getByTestId('barter-screen')).toBeVisible({ timeout: 30_000 });
    await audit(page, 'handel');
  });
});
