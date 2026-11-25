import { expect, test } from '@playwright/test';

const calls = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __charCalls: unknown[] }).__charCalls.length);

test.describe('panel postaci i awans', () => {
  test('spend 2 skill points in draft then confirm updates view', async ({ page }) => {
    await page.goto('/?view=character');
    await page.waitForSelector('[data-testid=character-screen]');
    const plus = page.getByLabel('Zwiększ: Pierwsza pomoc');
    await plus.click();
    await plus.click();
    await expect(page.getByTestId('skill-level-6')).toHaveText('40%');
    await expect(page.getByTestId('skill-points')).toContainText('5 punktów');
    expect(await calls(page)).toBe(0);
    await page.getByRole('button', { name: 'Zatwierdź', exact: true }).click();
    await expect(page.getByTestId('skill-level-6')).toHaveText('40%');
    await expect(page.getByTestId('skill-points')).toContainText('5 punktów');
    expect(await calls(page)).toBe(2);
  });

  test('cancel draft restores', async ({ page }) => {
    await page.goto('/?view=character');
    await page.waitForSelector('[data-testid=character-screen]');
    await page.getByLabel('Zwiększ: Handel').click();
    await expect(page.getByTestId('skill-level-15')).toHaveText('66%');
    await page.getByRole('button', { name: 'Cofnij', exact: true }).click();
    await expect(page.getByTestId('skill-level-15')).toHaveText('65%');
    await expect(page.getByTestId('skill-points')).toContainText('7 punktów');
    expect(await calls(page)).toBe(0);
  });

  test('perk picker lists only available perks', async ({ page }) => {
    await page.goto('/?view=character');
    await page.getByRole('button', { name: /Wybierz atut/ }).click();
    const picker = page.getByTestId('perk-picker');
    await expect(picker.getByRole('option')).toHaveCount(2);
    await expect(picker.getByText('Mistrz medycyny')).toHaveCount(0);
  });

  test('unmet requirements shown in tooltip', async ({ page }) => {
    await page.goto('/?view=character');
    await page.getByRole('button', { name: /Wybierz atut/ }).click();
    await page.getByRole('switch', { name: 'Pokaż niedostępne' }).click();
    await page.getByTestId('perk-option-3').hover();
    const tip = page.getByTestId('perk-unmet');
    await expect(tip).toContainText('Inteligencja: co najmniej 6');
    await expect(tip).toContainText('Medycyna: co najmniej 75%');
    await expect(tip).toContainText('Wymagany poziom: 12');
  });

  test('stat bonus tooltip lists sources', async ({ page }) => {
    await page.goto('/?view=character');
    await page.getByTestId('special-0').hover();
    await expect(page.getByTestId('stat-sources')).toContainText('Wzmacniacz Sily: +1');
  });

  test('touch: level-up as bottom sheet', async ({ page }, info) => {
    await page.goto('/?view=character&levelup=1&profile=touch');
    const levelup = page.getByTestId('levelup');
    await expect(levelup).toBeVisible();
    const touch = Boolean(info.project.use.hasTouch);
    const sheet = page.locator('.f2-sheet');
    if (touch) {
      await expect(sheet).toBeVisible();
      const box = await sheet.boundingBox();
      const vh = page.viewportSize()?.height ?? 0;
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(vh - 2);
    }
    await page.getByRole('button', { name: 'Zatwierdź awans' }).click();
    await expect(levelup).toHaveCount(0);
  });
});
