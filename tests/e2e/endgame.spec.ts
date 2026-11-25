import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { collectErrors } from './helpers';

// Uruchamiane przez playwright.endgame.config.ts (Playground @f2/ui, port 5650).
test.describe('Zakonczenie, smierc, napisy, menu', () => {
  let errors: string[] = [];
  test.beforeEach(({ page }) => {
    errors = collectErrors(page);
  });
  test.afterEach(() => {
    // 404 favicon w playgroundzie nie jest bledem ekranow
    expect(
      errors.filter((e) => !e.includes('404')),
      'bledy konsoli',
    ).toEqual([]);
  });

  test('slajdy -> napisy -> ESC -> menu glowne', async ({ page }) => {
    await page.goto('/?view=endgame');
    await expect(page.getByTestId('endgame-screen')).toBeVisible();
    await expect(page.getByTestId('endgame-caption')).toContainText('Arroyo');
    await page.getByTestId('endgame-next').click();
    await expect(page.getByTestId('endgame-screen')).toHaveAttribute('data-pan', '-1');
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await expect(page.getByTestId('credits-screen')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('main-menu-screen')).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __endgameCalls: string[] }).__endgameCalls),
    ).toContain('finishCredits');
  });

  test('smierc: napis, dowolny klawisz prowadzi do menu z wczytaniem ostatniego zapisu', async ({
    page,
  }) => {
    await page.goto('/?view=endgame&start=death&lastsave=1');
    await expect(page.getByTestId('death-screen')).toBeVisible();
    await expect(page.getByTestId('death-caption')).not.toBeEmpty();
    await page.keyboard.press('x');
    await expect(page.getByTestId('main-menu-screen')).toBeVisible();
    await page.getByTestId('menu-load-last').click();
    expect(
      await page.evaluate(() => (window as unknown as { __endgameCalls: string[] }).__endgameCalls),
    ).toContain('loadLast');
  });

  test('napisy przewijaja sie (animacja) i da sie pominac przyciskiem', async ({ page }) => {
    await page.goto('/?view=endgame&start=credits');
    const roll = page.getByTestId('credits-roll');
    await expect(roll).toBeVisible();
    const name = await roll.evaluate((el) => getComputedStyle(el).animationName);
    expect(name).toBe('f2-credits-roll');
    await page.getByTestId('credits-skip').click();
    await expect(page.getByTestId('main-menu-screen')).toBeVisible();
  });

  test('menu glowne w PWA nie ma przycisku wyjscia; wersja widoczna', async ({ page }) => {
    await page.goto('/?view=endgame&start=main-menu&pwa=1');
    await expect(page.getByTestId('menu-new')).toBeVisible();
    await expect(page.getByTestId('menu-quit')).toHaveCount(0);
    await expect(page.getByTestId('menu-version')).toContainText('0.0.0-dev');
  });

  for (const start of ['endgame', 'death', 'credits', 'main-menu']) {
    test(`axe: ${start} bez bledow krytycznych`, async ({ page }) => {
      await page.goto(`/?view=endgame&start=${start}`);
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(bad.map((v) => v.id)).toEqual([]);
    });
  }

  test('dotyk: przyciski Dalej i Pomin maja min. 44 px', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'tylko profil mobile');
    await page.goto('/?view=endgame');
    const box = await page.getByTestId('endgame-next').boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });
});
