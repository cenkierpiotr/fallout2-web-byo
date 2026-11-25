import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, openGame, finishCreator } from './helpers';
import { presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

// Telefon 390x844: w trakcie gry panel startowy (onboarding, status, zakladki, kopia) jest zwiniety.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const SHOT_DIR = process.env['F2_SHOT_DIR'];

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

const shot = async (page: Page, name: string): Promise<void> => {
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
};

test('mobile 390: w grze panel startowy jest ukryty, dostep przez przycisk Panel', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = collectErrors(page);
  await startNewGame(page);
  for (const id of ['onboarding', 'backup-panel', 'status-text', 'movie-shelf', 'tab-play']) {
    await expect(page.getByTestId(id), id).toBeHidden();
  }
  const vh = page.viewportSize()?.height ?? 844;
  const gb = await page.getByTestId('game-shell').boundingBox();
  expect(gb?.height ?? 0).toBeGreaterThan(vh * 0.7);
  await shot(page, 'game');

  // HUD: przyciski w zasiegu ekranu i bez nakladania
  const ids = ['inv-open', 'worldmap-open', 'char-open', 'combat-start'];
  const boxes: { x: number; y: number; width: number; height: number }[] = [];
  for (const id of ids) {
    const b = await page.getByTestId(id).boundingBox();
    expect(b, id).not.toBeNull();
    if (!b) continue;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
    expect(b.y + b.height).toBeLessThanOrEqual(vh);
    boxes.push(b);
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const overlap =
        a.x < b.x + b.width - 1 &&
        b.x < a.x + a.width - 1 &&
        a.y < b.y + b.height - 1 &&
        b.y < a.y + a.height - 1;
      expect(overlap, `${ids[i]} nachodzi na ${ids[j]}`).toBe(false);
    }

  await page.getByTestId('inv-open').click();
  await shot(page, 'inventory');
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: /Pip-Boy/i })
    .first()
    .click();
  await expect(page.getByTestId('pipboy-screen')).toBeVisible();
  await shot(page, 'pipboy');
  await page.keyboard.press('Escape');
  await page.getByTestId('char-open').click();
  await shot(page, 'character');
  // paski HP/AP w naglowku karty postaci maja szerokosc (nie zapadaja sie do pionowych kresek)
  for (const bar of await page.getByTestId('character-screen').getByRole('progressbar').all()) {
    expect((await bar.boundingBox())?.width ?? 0).toBeGreaterThan(100);
  }
  await page.keyboard.press('Escape');

  // przycisk Panel rozwija i zwija panel startowy
  await page.getByTestId('start-panel-toggle').click();
  await expect(page.getByTestId('backup-panel')).toBeVisible();
  await page.getByTestId('start-panel-toggle').click();
  await expect(page.getByTestId('backup-panel')).toBeHidden();
  expect(errors.filter((e) => !/favicon|404|WebGL|GPU/i.test(e))).toEqual([]);
});

test('mobile 390: walka, HUD w zasiegu, komunikaty po polsku', async ({ page }) => {
  test.setTimeout(300_000);
  await startNewGame(page);
  const start = page.getByTestId('combat-start');
  test.skip(!(await start.isVisible()), 'brak krytera w poblizu na starcie mapy');
  await start.click();
  const hud = page.getByTestId('combat-hud');
  await expect(hud).toBeVisible();
  await expect(hud).toContainText(/Atakuj/);
  await page.getByTestId('combat-attack').click();
  await shot(page, 'combat');
  const vh = page.viewportSize()?.height ?? 844;
  for (const id of ['combat-attack', 'combat-end-turn']) {
    const b = await page.getByTestId(id).boundingBox();
    if (!b) continue;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(390);
    expect(b.y + b.height).toBeLessThanOrEqual(vh);
  }
  const text = await page.getByTestId('game-shell').innerText();
  expect(text).not.toMatch(/\b(You hit|You miss|Attack|End turn)\b/);
});
