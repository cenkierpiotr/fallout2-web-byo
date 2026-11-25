import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { GAME_DIR, collectErrors, openGame, finishCreator } from './helpers';
import { presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

const OUT = process.env['F2_OUT_DIR'] ?? './test-results/worldmap-out';

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

test.describe('mapa swiata: test wizualny i przewijanie etykiet', () => {
  test('zrzuty ekranu mapy swiata i mapy miasta, kolko myszy przewija etykiety', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    const errors = collectErrors(page);
    await startNewGame(page);
    await page.getByTestId('worldmap-open').click();
    await expect(page.getByTestId('worldmap-screen')).toBeVisible({ timeout: 60_000 });
    const canvas = page.getByTestId('worldmap-canvas');
    await expect(canvas).toBeVisible();

    // odkryj kilka miejsc, zeby lista etykiet przekroczyla 5 pozycji
    await page.evaluate(() => {
      const m = (
        window as unknown as {
          __f2wm: {
            model: {
              data: { areas: unknown[] };
              fog: { fill(v: number): void };
              markKnown(i: number): void;
            };
          };
        }
      ).__f2wm.model;
      m.fog.fill(1);
      for (let i = 0; i < Math.min(9, m.data.areas.length); i++) m.markKnown(i);
    });
    await page.waitForTimeout(500);
    await canvas.screenshot({ path: `${OUT}/worldmap-world.png` });

    const labelOffset = (): Promise<number> =>
      canvas.evaluate((el) => Number((el as HTMLElement).dataset['labelOffset'] ?? 0));
    expect(await labelOffset()).toBe(0);
    const box = (await canvas.boundingBox())!;
    const lx = box.x + (545 / 640) * box.width;
    const ly = box.y + (260 / 480) * box.height;
    await page.mouse.move(lx, ly);
    await page.mouse.wheel(0, 120);
    await expect.poll(labelOffset).toBeGreaterThan(0);
    await canvas.screenshot({ path: `${OUT}/worldmap-world-scrolled.png` });
    await page.mouse.wheel(0, -500);
    await expect.poll(labelOffset).toBe(0);

    // mapa miasta
    await page.getByTestId('worldmap-city-0').click();
    await page.getByTestId('worldmap-town-toggle').click();
    await page.waitForTimeout(800);
    await canvas.screenshot({ path: `${OUT}/worldmap-town.png` });
    expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
  });

  test('panel samochodu na canvasie, klawisze strzalek i Home, zrzut worldmap-car.png', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    const errors = collectErrors(page);
    await startNewGame(page);
    await page.getByTestId('worldmap-open').click();
    await expect(page.getByTestId('worldmap-screen')).toBeVisible({ timeout: 60_000 });
    const canvas = page.getByTestId('worldmap-canvas');
    await page.evaluate(() => {
      const ctl = (
        window as unknown as {
          __f2wm: {
            model: {
              data: { areas: unknown[] };
              fog: { fill(v: number): void };
              markKnown(i: number): void;
            };
            host: { car?: { fuel: number; moving: boolean; area: number } };
          };
        }
      ).__f2wm;
      ctl.model.fog.fill(1);
      for (let i = 0; i < Math.min(5, ctl.model.data.areas.length); i++) ctl.model.markKnown(i);
      // stan auta pochodzi z hosta (refreshCar nadpisuje model przy kazdym odczycie)
      ctl.host.car = { fuel: 60000, moving: true, area: -1 };
    });
    await page.waitForTimeout(500);
    await canvas.screenshot({ path: `${OUT}/worldmap-car.png` });
    const sx = (): Promise<number> =>
      canvas.evaluate((el) => Number((el as HTMLElement).dataset['scrollX'] ?? 0));
    const x0 = await sx();
    await page.keyboard.press('ArrowRight');
    await expect.poll(sx).toBe(x0 + 20);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(sx).toBe(x0);
    expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
  });
});
