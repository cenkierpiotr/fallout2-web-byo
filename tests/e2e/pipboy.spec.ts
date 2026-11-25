import { expect, test } from '@playwright/test';

test.describe('Pip-Boy', () => {
  test('pipboy opens with P key and HUD button', async ({ page }) => {
    await page.goto('/?view=pipboy');
    await page.waitForSelector('[data-testid=hud-pipboy]');
    await expect(page.getByTestId('pipboy-screen')).toHaveCount(0);
    await page.keyboard.press('p');
    await expect(page.getByTestId('pipboy-screen')).toBeVisible();
    await expect(page.getByTestId('pipboy-status')).toContainText('Wybraniec');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pipboy-screen')).toHaveCount(0);
    await page.getByRole('button', { name: 'Otwórz Pip-Boya' }).click();
    await expect(page.getByTestId('pipboy-screen')).toBeVisible();
    await page.keyboard.press('p');
    await expect(page.getByTestId('pipboy-screen')).toHaveCount(0);
  });

  test('tabs keyboard navigable', async ({ page }) => {
    await page.goto('/?view=pipboy');
    await page.keyboard.press('p');
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(5);
    await page.getByRole('tab', { name: 'Stan' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Zadania' })).toBeFocused();
    await expect(page.getByTestId('pipboy-quests')).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Budzik' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('pipboy-clock')).toBeVisible();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('pipboy-status')).toBeVisible();
  });

  test('touch: tabs at bottom', async ({ page }) => {
    await page.goto('/?view=pipboy&profile=touch');
    await page.getByRole('button', { name: 'Otwórz Pip-Boya' }).click();
    await expect(page.getByTestId('pipboy-screen')).toHaveAttribute('data-tabs', 'bottom');
    const tab = await page.getByRole('tab', { name: 'Stan' }).boundingBox();
    const panel = await page.getByTestId('pipboy-panel').boundingBox();
    expect(tab!.y).toBeGreaterThan(panel!.y + panel!.height - 1);
    expect(tab!.height).toBeGreaterThanOrEqual(44);
  });

  test('desktop: tabs at top', async ({ page }) => {
    await page.goto('/?view=pipboy&profile=desktop');
    await page.keyboard.press('p');
    await expect(page.getByTestId('pipboy-screen')).toHaveAttribute('data-tabs', 'top');
  });

  test('zadania, archiwa, mapa i budzik na danych demo', async ({ page }) => {
    await page.goto('/?view=pipboy');
    await page.keyboard.press('p');
    await page.getByRole('tab', { name: 'Zadania' }).click();
    await expect(page.getByText('Odzyskaj GECK')).toBeVisible();
    await page.getByRole('switch', { name: 'Tylko aktywne' }).click();
    await expect(page.getByText('Znajdz Vic')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Archiwa' }).click();
    await page.getByRole('button', { name: 'Dziennik Vaulta' }).click();
    await expect(page.getByTestId('pipboy-holodisk-pager')).toContainText('1/2');
    await page.getByRole('button', { name: 'Następna strona' }).click();
    await expect(page.getByTestId('pipboy-holodisk-page')).toContainText('Wiersz 40');

    await page.getByRole('tab', { name: 'Mapa' }).click();
    await expect(page.getByTestId('pipboy-automap')).toHaveAttribute('data-revealed', '400');

    await page.getByRole('tab', { name: 'Budzik' }).click();
    await expect(page.getByTestId('pipboy-clock')).toContainText('13:00');
    await page.getByRole('button', { name: 'Odpocznij 30 min' }).click();
    await expect(page.getByTestId('pipboy-clock')).toContainText('13:30');
  });

  test('EN: etykiety zakladek', async ({ page }) => {
    await page.goto('/?view=pipboy&lang=en');
    await page.keyboard.press('p');
    await expect(page.getByRole('tab', { name: 'Quests' })).toBeVisible();
    await page.getByRole('tab', { name: 'Quests' }).click();
    await expect(page.getByRole('switch', { name: 'Active only' })).toBeVisible();
  });
});
