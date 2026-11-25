import { expect, test } from '@playwright/test';
import { GAME_DIR, collectErrors, finishCreator, openGame } from './helpers';
import { presetStorage } from './map-helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

/** Okno windy: otwierane przez ten sam modul sygnalu co skrypty (vite dev udostepnia moduly po URL). */
test('okno windy: przyciski pieter, wybor i anulowanie', async ({ page }, info) => {
  test.setTimeout(240_000);
  const touch = info.project.name.endsWith('mobile');
  const errors = collectErrors(page);
  await presetStorage(page, 2);
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

  const open = (): Promise<number> =>
    page.evaluate(async () => {
      const m = await import(/* @vite-ignore */ '/src/game/elevator-host.ts');
      const w = window as unknown as { __elev?: number };
      w.__elev = -2;
      const ok = m.openElevatorPrompt(
        { type: 0, level: 0 },
        {
          currentMapIndex: () => -1,
          go: () => {
            w.__elev = -1;
          },
        },
      );
      const p = m.elevatorPrompt.value;
      if (p) {
        const orig = p.onChoose;
        p.onChoose = (n: number) => {
          orig(n);
          w.__elev = n;
        };
      }
      return ok ? (p?.buttons.length ?? 0) : 0;
    });

  const n = await open();
  expect(n).toBeGreaterThan(0);
  const dlg = page.getByTestId('elevator');
  await expect(dlg).toBeVisible();
  await expect(page.getByTestId('elevator-btn-0')).toBeVisible();
  await expect(page.getByTestId(`elevator-btn-${n - 1}`)).toBeVisible();

  const btn = page.getByTestId('elevator-btn-0');
  if (touch) await btn.tap();
  else await btn.click();
  await expect(dlg).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __elev: number }).__elev)).toBe(0);

  await open();
  await expect(dlg).toBeVisible();
  const cancel = page.getByRole('button', { name: /anuluj/i });
  if (touch) await cancel.tap();
  else await cancel.click();
  await expect(dlg).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __elev: number }).__elev)).toBe(-2);

  expect(errors.filter((e) => !/favicon|swiftshader|GPU stall/i.test(e))).toEqual([]);
});
