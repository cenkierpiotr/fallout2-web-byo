import { expect, test } from '@playwright/test';

test.describe('Odpoczynek', () => {
  test('rest until morning changes HUD clock', async ({ page }) => {
    await page.goto('/?view=rest');
    await expect(page.getByTestId('hud-clock')).toContainText('22:30');
    await page.keyboard.press('r');
    await expect(page.getByTestId('rest-screen')).toBeVisible();
    await page.getByTestId('rest-mode-until-morning').click();
    await expect(page.getByTestId('rest-result')).toContainText('Odpoczywano 7,5 godz.');
    await expect(page.getByTestId('hud-clock')).toContainText('06:00');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('rest-screen')).toHaveCount(0);
  });

  test('custom hours validated and applied', async ({ page }) => {
    await page.goto('/?view=rest');
    await page.getByRole('button', { name: 'Odpocznij' }).first().click();
    await page.getByTestId('rest-hours').fill('0');
    await expect(page.getByTestId('rest-custom-go')).toBeDisabled();
    await page.getByTestId('rest-hours').fill('3');
    await page.getByTestId('rest-hours').press('Enter');
    await expect(page.getByTestId('hud-clock')).toContainText('01:30');
    expect(
      await page.evaluate(() => (window as unknown as { __restCalls: unknown[] }).__restCalls),
    ).toEqual([{ hours: 3 }]);
  });

  test('rest refused with enemies shows reason', async ({ page }) => {
    await page.goto('/?view=rest&enemies=1');
    await page.keyboard.press('r');
    await expect(page.getByTestId('rest-enemies')).toBeVisible();
    await expect(page.getByTestId('rest-mode-h1')).toBeDisabled();
    await expect(page.getByTestId('hud-clock')).toContainText('22:30');
  });

  test('interrupted rest shows message', async ({ page }) => {
    await page.goto('/?view=rest&interrupt=1');
    await page.keyboard.press('r');
    await page.getByTestId('rest-mode-h1').click();
    await expect(page.getByTestId('rest-result')).toContainText('przerwany');
  });

  test('touch: targets at least 44px', async ({ page }) => {
    await page.goto('/?view=rest&profile=touch');
    await page.getByRole('button', { name: 'Odpocznij' }).first().click();
    const box = await page.getByTestId('rest-mode-h1').locator('xpath=..').boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByTestId('rest-screen')).toHaveAttribute('data-profile', 'touch');
  });
});
