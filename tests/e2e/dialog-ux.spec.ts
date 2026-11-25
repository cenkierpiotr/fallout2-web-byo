import { expect, test } from '@playwright/test';

const url = (q = '') => `/?view=dialog${q}`;

test.describe('dialog: UX i dostepnosc', () => {
  test('option cards >= 48px on touch', async ({ page }) => {
    await page.goto(url('&profile=touch'));
    await page.waitForSelector('[data-testid=dialog-screen]');
    await expect(page.getByTestId('dialog-screen')).toHaveAttribute('data-profile', 'touch');
    const heights = await page.$$eval('[data-testid=dialog-option]', (els) =>
      els.map((e) => e.getBoundingClientRect().height),
    );
    expect(heights.length).toBeGreaterThanOrEqual(3);
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(48);
    // touch: portret nad tekstem (uklad pionowy), bez numerow klawiszy
    const portrait = await page.getByTestId('dialog-portrait').boundingBox();
    const text = await page.getByTestId('dialog-npc-text').boundingBox();
    expect(portrait!.y + portrait!.height).toBeLessThanOrEqual(text!.y + 1);
    await expect(page.locator('.f2-option-card__key').first()).toBeHidden();
  });

  test('digit keys choose options on desktop', async ({ page }) => {
    await page.goto(url());
    await page.waitForSelector('[data-testid=dialog-screen]');
    // portret po lewej od tekstu
    const portrait = await page.getByTestId('dialog-portrait').boundingBox();
    const text = await page.getByTestId('dialog-npc-text').boundingBox();
    expect(portrait!.x + portrait!.width).toBeLessThanOrEqual(text!.x + 1);
    await page.keyboard.press('2');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __dialogLog: string[] }).__dialogLog))
      .toContain('choose:1');
    await expect(page.getByTestId('dialog-npc-text')).toContainText('Odpowiedz');
    // fokus wraca na pierwsza opcje nowego wezla
    await expect(page.getByTestId('dialog-option').first()).toBeFocused();
  });

  test('npc text announced (aria-live present and updated)', async ({ page }) => {
    await page.goto(url());
    const text = page.getByTestId('dialog-npc-text');
    await expect(text).toHaveAttribute('aria-live', 'polite');
    const before = await text.textContent();
    await page.getByTestId('dialog-option').first().click();
    await expect(text).not.toHaveText(before ?? '');
    await expect(text).toHaveAttribute('aria-live', 'polite');
  });

  test('skill requirement badge shows percent when setting on', async ({ page }) => {
    await page.goto(url('&percent=1'));
    await expect(page.getByTestId('dialog-option-req').first()).toHaveText('Retoryka 65%');
    await page.goto(url());
    await expect(page.getByTestId('dialog-option-req').first()).toHaveText('Retoryka');
  });

  test('review toggles full history and barter button issues command', async ({ page }) => {
    await page.goto(url());
    await page.getByTestId('dialog-review').click();
    await expect(page.getByTestId('dialog-review')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('dialog-history')).toContainText('Witaj');
    await page.getByTestId('dialog-barter').click();
    expect(
      await page.evaluate(() => (window as unknown as { __dialogLog: string[] }).__dialogLog),
    ).toContain('barter');
  });
});
