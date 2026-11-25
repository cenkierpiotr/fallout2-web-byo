import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const INTERACTIVE = 'button, [role=tab], input, [role=menuitem]';
const THEMES = ['modern', 'retro', 'high-contrast'] as const;

test.describe('playground @f2/ui', () => {
  test('cele dotykowe w profilu touch maja min. 44x44', async ({ page }, info) => {
    test.skip(!info.project.use.hasTouch, 'tylko profile dotykowe');
    await page.goto('/?profile=touch');
    await page.waitForSelector('main.pg');
    const small = await page.$$eval(INTERACTIVE, (els) =>
      els
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            text: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim(),
            w: r.width,
            h: r.height,
          };
        })
        .filter((r) => r.w > 0 && (r.w < 44 || r.h < 44)),
    );
    expect(small).toEqual([]);
  });

  test('brak poziomego przewijania strony', async ({ page }, info) => {
    test.skip(info.project.use.viewport?.width !== 390, 'tylko 390 px');
    await page.goto('/?profile=touch');
    await page.waitForSelector('main.pg');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  for (const theme of THEMES) {
    test(`axe: 0 powaznych naruszen (motyw ${theme})`, async ({ page }, info) => {
      const profile = info.project.use.hasTouch ? 'touch' : 'desktop';
      await page.goto(`/?theme=${theme}&profile=${profile}`);
      await page.waitForSelector('main.pg');
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(
        bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
      ).toEqual([]);
    });
  }

  test('skala czcionki 1.6 nie powoduje przepelnienia paneli', async ({ page }, info) => {
    const profile = info.project.use.hasTouch ? 'touch' : 'desktop';
    await page.goto(`/?scale=1.6&profile=${profile}`);
    await page.waitForSelector('main.pg');
    const overflowing = await page.$$eval('.f2-panel', (els) =>
      els
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => el.querySelector('.f2-panel__title')?.textContent ?? '?'),
    );
    expect(overflowing).toEqual([]);
    const pageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(pageOverflow).toBeLessThanOrEqual(0);
  });
});
