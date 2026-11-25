import { expect, test } from '@playwright/test';

async function minTarget(page: import('@playwright/test').Page): Promise<number> {
  return page.$$eval(
    '[data-testid=controls-tab] button, [data-testid=controls-tab] select',
    (els) =>
      Math.min(
        ...els.map((el) => {
          const r = el.getBoundingClientRect();
          return Math.min(r.width, r.height);
        }),
      ),
  );
}

test.describe('ustawienia sterowania', () => {
  test('switch profile in settings changes targets without reload', async ({ page }) => {
    await page.goto('/?view=controls&profile=desktop');
    await page.waitForSelector('[data-testid=controls-tab]');
    await page.evaluate(() => {
      (window as unknown as { __noReload: boolean }).__noReload = true;
    });
    await page.getByLabel('Profil wejscia').selectOption('desktop');
    await expect(page.locator('html')).toHaveAttribute('data-profile', 'desktop');
    const desktopMin = await minTarget(page);
    expect(desktopMin).toBeLessThan(44);

    await page.getByLabel('Profil wejscia').selectOption('touch');
    await expect(page.locator('html')).toHaveAttribute('data-profile', 'touch');
    await expect(page.locator('html')).toHaveAttribute('data-gestures', 'true');
    expect(await minTarget(page)).toBeGreaterThanOrEqual(44);

    await page.getByLabel('Profil wejscia').selectOption('hybrid');
    await expect(page.locator('html')).toHaveAttribute('data-profile', 'desktop');
    await expect(page.locator('html')).toHaveAttribute('data-gestures', 'true');

    expect(
      await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload),
    ).toBe(true);
  });

  test('auto wybiera profil z urzadzenia', async ({ page }, info) => {
    await page.goto('/?view=controls&profile=desktop');
    await page.waitForSelector('[data-testid=controls-tab]');
    const touch = Boolean(info.project.use.hasTouch);
    const narrow = (info.project.use.viewport?.width ?? 1920) < 1024;
    // wazki ekran dotykowy -> touch; duzy ekran dotykowy -> hybrid (wyglad desktop + gesty)
    await expect(page.locator('html')).toHaveAttribute(
      'data-profile',
      touch && narrow ? 'touch' : 'desktop',
    );
    await expect(page.locator('html')).toHaveAttribute('data-gestures', String(touch));
  });
});
