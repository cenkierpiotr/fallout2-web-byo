import { expect, test } from '@playwright/test';

const PL = 'zażółć gęślą jaźń';
const ASCII = 'zazolc gesla jazn';

test.describe('motyw retro: znaki PL', () => {
  test("retro theme renders 'zazolc gesla jazn' without tofu", async ({ page }) => {
    await page.goto('/?view=msg&theme=retro');
    await page.waitForSelector('[data-testid=msg-table]');
    await page.getByLabel('Plik MSG').selectOption('dialog/klint.msg');
    await expect(page.locator('td[lang=pl]').first()).toContainText('ĄĆĘŁŃÓŚŹŻ');
    const r = await page.evaluate(
      async ({ pl, ascii }) => {
        await document.fonts.load("22px 'VT323 F2'", pl);
        const el = document.querySelector('[data-testid=msg-table] td[lang=pl]')!;
        const cs = getComputedStyle(el);
        const ctx = document.createElement('canvas').getContext('2d')!;
        ctx.font = `${cs.fontSize} ${cs.fontFamily}`;
        const w = (s: string) => ctx.measureText(s).width;
        return {
          family: cs.fontFamily,
          wPl: w(pl),
          wAscii: w(ascii),
          wTofu: w('�'),
          loaded: document.fonts.check("22px 'VT323 F2'", pl),
          text: document.body.innerText,
        };
      },
      { pl: PL, ascii: ASCII },
    );
    expect(r.family).toContain('VT323 F2');
    expect(r.loaded).toBe(true);
    expect(r.wPl).toBeGreaterThan(0);
    expect(r.wAscii).toBeGreaterThan(0);
    // czcionka ma glify diakrytykow: szerokosc zblizona do wersji bez ogonkow (monospace, brak tofu/fallbacku)
    expect(Math.abs(r.wPl - r.wAscii)).toBeLessThan(0.5);
    expect(r.text).not.toContain('�');
    expect(r.text).toContain('ĄĆĘŁŃÓŚŹŻ');
  });

  test('modern theme uses system font with full PL', async ({ page }) => {
    await page.goto('/?view=msg&theme=modern');
    await page.waitForSelector('[data-testid=msg-table]');
    const family = await page
      .locator('td[lang=pl]')
      .first()
      .evaluate((e) => getComputedStyle(e).fontFamily);
    expect(family).not.toContain('VT323');
  });

  test('msg-browser shows fallback count', async ({ page }) => {
    await page.goto('/?view=msg');
    await page.waitForSelector('[data-testid=msg-table]');
    // game/stat.msg: 4 wpisy EN, 3 PL => 1 fallback
    await expect(page.getByTestId('msg-total')).toHaveText('4');
    await expect(page.getByTestId('msg-fallback-count')).toHaveText('1');
    await expect(page.getByTestId('msg-row')).toHaveCount(4);
    await page.getByRole('switch', { name: 'Tylko fallback' }).click();
    await expect(page.getByTestId('msg-row')).toHaveCount(1);
    await expect(page.getByTestId('msg-row').first()).toHaveAttribute('data-id', '103');
  });

  test('msg-browser switches file and previews placeholders', async ({ page }) => {
    await page.goto('/?view=msg');
    await page.waitForSelector('[data-testid=msg-table]');
    await page.getByLabel('Plik MSG').selectOption('game/skill.msg');
    await expect(page.getByTestId('msg-fallback-count')).toHaveText('0');
    // 504: %d w EN i PL; 505: @pc@ %s %s w EN i PL
    await expect(page.getByTestId('msg-placeholder')).toHaveCount(2 + 6);
    await expect(page.locator('[data-ph-ok=false]')).toHaveCount(0);
  });
});
