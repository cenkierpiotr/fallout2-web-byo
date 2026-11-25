import { expect, test } from '@playwright/test';

/** Dymny test wyboru gry i hosta Fallout 1 CE (ADR-0022). Bez danych gry: weryfikujemy UI + ladowanie WASM. */

test.beforeEach(async ({ page }) => {
  // Czysty stan: onboarding zamkniety. Firebase storage jest pusty w nowym kontekscie Playwright.
  await page.addInitScript(() => {
    localStorage.setItem('f2.onboarding', JSON.stringify({ step: 5, done: true, v: 1 }));
  });
});

test('ekran startowy oferuje wybor F1/F2 i zapamietuje wybor', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('game-select')).toBeVisible();
  await page.getByTestId('choose-fo1').click();
  await page.reload();
  await expect(page.getByTestId('game-select')).toHaveCount(0);
});

test('FO1: silnik WASM laduje sie i czeka na dane gry', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('f2.game', 'fo1'));
  await page.goto('/');
  // Silnik WASM (2.9 MB) ladowany leniwie po wyborze F1; canvas widoczny, import dostepny.
  await expect(page.getByTestId('fo1-import')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#canvas')).toBeVisible();
  // Start bez danych gry = disabled (master.dat brak) albo widoczny komunikat, ale strona zyje.
  await expect(page.getByTestId('fo1-start')).toBeVisible({ timeout: 30_000 });
  const bodyOk = await page.evaluate(() => document.body.innerText.length > 0);
  expect(bodyOk).toBe(true);
});
