import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const card = (page: Page, id: string) => page.locator(`[data-testid=save-card][data-slot="${id}"]`);
const calls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __saveCalls: string[] }).__saveCalls.slice());

test.describe('Ekran zapisow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?view=saves');
    await page.waitForSelector('[data-testid=saves-screen]');
  });

  test('save to manual-1 shows card with thumbnail', async ({ page }) => {
    const c = card(page, 'manual-1');
    await expect(c).toHaveAttribute('data-empty', 'true');
    await c.getByRole('button', { name: 'Zapisz: Slot 2' }).click();
    await expect(c).toHaveAttribute('data-empty', 'false');
    await expect(c.locator('[data-testid=save-thumb] img')).toBeVisible();
    await expect(c).toContainText('Arroyo');
    await expect(c).toContainText('Poziom');
    await expect(page.getByText('Zapisano: Slot 2')).toBeVisible();
    expect(await calls(page)).toEqual(['save:manual-1']);
  });

  test('overwrite asks confirmation', async ({ page }) => {
    const c = card(page, 'manual-0');
    await c.getByRole('button', { name: 'Zapisz: Slot 1' }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toContainText('Nadpisać zapis?');
    expect(await calls(page)).toEqual([]);
    await dlg.getByRole('button', { name: 'Anuluj' }).click();
    await expect(dlg).toHaveCount(0);
    expect(await calls(page)).toEqual([]);
    await c.getByRole('button', { name: 'Zapisz: Slot 1' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Nadpisz' }).click();
    await expect.poll(() => calls(page)).toEqual(['save:manual-0']);
  });

  test('delete asks confirmation and empties slot', async ({ page }) => {
    const c = card(page, 'manual-0');
    await c.getByRole('button', { name: 'Usuń: Slot 1' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Usuń', exact: true }).click();
    await expect(c).toHaveAttribute('data-empty', 'true');
  });

  test('import invalid file shows error toast save-corrupt translated', async ({ page }) => {
    await page.setInputFiles('[data-testid=saves-import-input]', {
      name: 'zly.json',
      mimeType: 'application/json',
      buffer: Buffer.from('to nie jest zapis'),
    });
    await expect(page.getByText('Plik zapisu jest uszkodzony lub nieprawidłowy')).toBeVisible();
    await page.setInputFiles('[data-testid=saves-import-input]', {
      name: 'ok.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"format":"f2save"}'),
    });
    await expect(card(page, 'manual-1')).toHaveAttribute('data-empty', 'false');
  });

  test('keyboard: arrows, Enter, F5 and F8', async ({ page }, info) => {
    test.skip(info.project.name !== 'ui-desktop', 'klawiatura: profil desktop');
    await card(page, 'manual-0').focus();
    await page.keyboard.press('ArrowDown');
    await expect(card(page, 'manual-1')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await expect.poll(() => calls(page)).toEqual(['load:manual-0']);
    await page.keyboard.press('F5');
    await expect(card(page, 'quick')).toHaveAttribute('data-empty', 'false');
    await page.keyboard.press('F8');
    await expect.poll(() => calls(page)).toEqual(['load:manual-0', 'save:quick', 'load:quick']);
  });

  test('touch: cards >= 44px tall and buttons >= 44px', async ({ page }, info) => {
    test.skip(info.project.name !== 'ui-mobile', 'dotyk');
    await page.goto('/?view=saves&profile=touch');
    await page.waitForSelector('[data-testid=saves-screen]');
    for (const c of await page.getByTestId('save-card').all()) {
      expect((await c.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    for (const b of await card(page, 'manual-0').getByRole('button').all()) {
      expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await card(page, 'manual-1').getByRole('button', { name: 'Zapisz: Slot 2' }).tap();
    await expect(card(page, 'manual-1')).toHaveAttribute('data-empty', 'false');
  });

  test('axe: 0 serious/critical, tez z modalem', async ({ page }) => {
    const run = async () => {
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      return res.violations
        .filter((x) => x.impact === 'serious' || x.impact === 'critical')
        .map(
          (x) =>
            `${x.id}: ${x.nodes
              .map((n) => n.target.join(' '))
              .slice(0, 3)
              .join(' | ')}`,
        );
    };
    expect(await run()).toEqual([]);
    await card(page, 'manual-0').getByRole('button', { name: 'Zapisz: Slot 1' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await run()).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(
      card(page, 'manual-0').getByRole('button', { name: 'Zapisz: Slot 1' }),
    ).toBeFocused();
  });
});
