import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

interface ViewSpec {
  name: string;
  query: string;
  ready: string;
  /** Element pierwszej akcji, do ktorego ma dojsc Tab (desktop). */
  primary: string;
}

// Ekrany dostepne w playgroundzie @f2/ui. Rest pominiety: otwierany klawiszem R, nie przez ?view.
const VIEWS: ViewSpec[] = [
  {
    name: 'creator',
    query: 'view=creator',
    ready: '[data-testid=creator-screen]',
    primary: '[data-testid=creator-name]',
  },
  {
    name: 'character',
    query: 'view=character',
    ready: '[data-testid=character-screen]',
    primary: '[aria-label^="Zwiększ"]',
  },
  {
    name: 'inventory',
    query: 'view=inventory&items=12',
    ready: '[data-testid=inventory-screen]',
    primary: '[data-testid=inv-item]',
  },
  {
    name: 'dialog',
    query: 'view=dialog',
    ready: '[data-testid=dialog-screen]',
    primary: '[data-testid=dialog-option]',
  },
  {
    name: 'pipboy',
    query: 'view=pipboy',
    ready: '[data-testid=hud-pipboy]',
    primary: '[data-testid=hud-pipboy] button',
  },
  {
    name: 'settings',
    query: 'view=controls',
    ready: '[data-testid=controls-tab]',
    primary: 'select',
  },
  {
    name: 'saves',
    query: 'view=saves',
    ready: '[data-testid=saves-screen]',
    primary: '[data-testid=save-card]',
  },
  {
    name: 'barter',
    query: 'view=barter',
    ready: '[data-testid=barter-screen]',
    primary: '[data-testid=barter-item]',
  },
  { name: 'a11y', query: 'view=a11y', ready: '[data-testid=a11y-tab]', primary: '[role=slider]' },
];

const withParams = (v: ViewSpec, extra = '') => `/?${v.query}${extra}`;

async function open(page: Page, v: ViewSpec, extra = ''): Promise<void> {
  await page.goto(withParams(v, extra));
  await page.waitForSelector(v.ready);
}

for (const v of VIEWS) {
  test.describe(`a11y: ${v.name}`, () => {
    test(`axe: 0 serious/critical`, async ({ page }) => {
      await open(page, v);
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const bad = res.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical');
      expect(
        bad.map(
          (x) =>
            `${x.id}: ${x.nodes
              .map((n) => n.target.join(' '))
              .slice(0, 3)
              .join(' | ')}`,
        ),
      ).toEqual([]);
    });

    test('every screen operable by keyboard: Tab reaches primary action', async ({
      page,
    }, info) => {
      test.skip(info.project.name !== 'ui-desktop', 'klawiatura: profil desktop');
      await open(page, v);
      const isPrimary = () =>
        page.evaluate(
          (sel) => !!document.activeElement && document.activeElement.matches(sel),
          v.primary,
        );
      let reached = await isPrimary();
      for (let i = 0; i < 60 && !reached; i++) {
        await page.keyboard.press('Tab');
        reached = await isPrimary();
      }
      expect(reached).toBe(true);
      // fokus jest widoczny (pierscien fokusu w kolorze akcentu)
      const outline = await page.evaluate(() => {
        const s = getComputedStyle(document.activeElement!);
        return { w: s.outlineWidth, style: s.outlineStyle };
      });
      expect(outline.style).not.toBe('none');
      expect(parseFloat(outline.w)).toBeGreaterThanOrEqual(2);
    });

    test('font scale 1.6 no overflow', async ({ page }) => {
      await open(page, v, '&scale=1.6');
      await expect(page.locator('html')).toHaveCSS('--font-scale', '1.6');
      const over = await page.evaluate(() => {
        const de = document.documentElement;
        const out: string[] = [];
        if (de.scrollWidth > de.clientWidth + 1)
          out.push(`page ${de.scrollWidth}>${de.clientWidth}`);
        for (const el of document.querySelectorAll<HTMLElement>(
          'main, [role=dialog], .f2-dialog__panel',
        )) {
          if (el.scrollWidth > el.clientWidth + 1)
            out.push(`${el.className} ${el.scrollWidth}>${el.clientWidth}`);
        }
        return out;
      });
      expect(over).toEqual([]);
    });

    test('high contrast text contrast >= 7:1', async ({ page }) => {
      await open(page, v, '&theme=high-contrast');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'high-contrast');
      const low = await page.evaluate(() => {
        type RGBA = [number, number, number, number];
        const parse = (s: string): RGBA => {
          const m = s.match(/rgba?\(([^)]+)\)/);
          if (!m) return [0, 0, 0, 0];
          const p = m[1]!
            .split(/[ ,/]+/)
            .filter(Boolean)
            .map(Number);
          return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
        };
        const over = (top: RGBA, bottom: RGBA): RGBA => {
          const a = top[3] + bottom[3] * (1 - top[3]);
          if (a === 0) return [0, 0, 0, 0];
          const c = (i: 0 | 1 | 2) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a;
          return [c(0), c(1), c(2), a];
        };
        const lum = ([r, g, b]: RGBA) => {
          const f = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const bgOf = (el: Element): RGBA => {
          const chain: RGBA[] = [];
          for (let e: Element | null = el; e; e = e.parentElement) {
            chain.push(parse(getComputedStyle(e).backgroundColor));
          }
          let acc: RGBA = [0, 0, 0, 1];
          for (const c of chain.reverse()) acc = over(c, acc);
          return acc;
        };
        const bad: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent?.trim()) continue;
          const el = n.parentElement!;
          if (el.closest('[disabled], [aria-disabled=true], script, style')) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          const bg = bgOf(el);
          const fg = over(parse(cs.color), bg);
          const l1 = lum(fg);
          const l2 = lum(bg);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          if (ratio < 7)
            bad.push(
              `${el.tagName}.${el.className} "${n.textContent.trim().slice(0, 24)}" ${ratio.toFixed(2)}`,
            );
        }
        return bad;
      });
      expect(low).toEqual([]);
    });
  });
}

test('colorblind and reduce-motion modes set attributes and change tokens', async ({ page }) => {
  await page.goto('/?view=a11y');
  await page.waitForSelector('[data-testid=a11y-tab]');
  const ok = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-state-ok').trim(),
    );
  const before = await ok();
  await page.getByLabel('Tryb dla daltonistów').selectOption('deutan');
  await expect(page.locator('html')).toHaveAttribute('data-colorblind', 'deutan');
  expect(await ok()).not.toBe(before);
  await page.getByRole('switch', { name: 'Ogranicz ruch i animacje' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-reduce-motion', 'true');
  await expect(page.locator('html')).toHaveCSS('--motion-fast', '0ms');
});
