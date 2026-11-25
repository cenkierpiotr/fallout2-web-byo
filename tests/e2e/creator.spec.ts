import { expect, test, type Page } from '@playwright/test';

const open = async (page: Page, profile: 'desktop' | 'touch') => {
  await page.goto(`/?view=creator&profile=${profile}`);
  await page.waitForSelector('[data-testid=creator-screen]');
};

test.describe('kreator postaci', () => {
  test('creator desktop: preset -> finish -> game screen', async ({ page }, info) => {
    test.skip((info.project.use.viewport?.width ?? 1920) < 1024, 'uklad 3 kolumn tylko desktop');
    await open(page, 'desktop');
    await expect(page.getByTestId('finish-reasons')).toBeVisible();
    await page.getByRole('button', { name: 'Wybierz postać: Narg' }).click();
    await expect(page.getByTestId('points-left')).toContainText('0');
    await expect(page.getByTestId('tags-counter')).toContainText('3/3');
    await expect(page.getByTestId('traits-counter')).toContainText('2/2');
    const finish = page.getByRole('button', { name: 'Zakończ i zacznij grę' });
    await expect(finish).toBeEnabled();
    await finish.click();
    await expect(page.getByTestId('game-screen')).toContainText('Narg');
  });

  test('creator touch: all tabs reachable, targets >= 44px', async ({ page }) => {
    await open(page, 'touch');
    for (const name of ['Postać', 'SPECIAL', 'Umiejętności', 'Cechy', 'Podsumowanie']) {
      await page.getByRole('tab', { name }).click();
      await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
      const min = await page.$$eval('[data-testid=creator-screen] button:not([disabled])', (els) =>
        Math.min(
          ...els
            .filter((el) => el.getBoundingClientRect().width > 0)
            .map((el) => {
              const r = el.getBoundingClientRect();
              return Math.min(r.width, r.height);
            }),
        ),
      );
      expect(min, `tab ${name}`).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('tab', { name: 'Postać' }).click();
    await page.getByRole('button', { name: 'Dalej' }).click();
    await expect(page.getByRole('tab', { name: 'SPECIAL' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('creator blocks finish with unspent points and shows reason', async ({ page }, info) => {
    const profile = (info.project.use.viewport?.width ?? 1920) < 1024 ? 'touch' : 'desktop';
    await open(page, profile);
    if (profile === 'touch') await page.getByRole('tab', { name: 'Podsumowanie' }).click();
    await expect(page.getByRole('button', { name: 'Zakończ i zacznij grę' })).toBeDisabled();
    await expect(page.getByTestId('finish-reasons')).toContainText('Rozdaj wszystkie punkty');
    await expect(page.getByTestId('points-left')).toContainText('5');
  });

  test('keyboard: tab order through stat +/- buttons', async ({ page }, info) => {
    const profile = (info.project.use.viewport?.width ?? 1920) < 1024 ? 'touch' : 'desktop';
    await open(page, profile);
    if (profile === 'touch') await page.getByRole('tab', { name: 'SPECIAL' }).click();
    await page.getByRole('button', { name: 'Zmniejsz: Siła' }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Zwiększ: Siła' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Zmniejsz: Percepcja' })).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('points-left-stats')).toContainText('4');
  });
});
