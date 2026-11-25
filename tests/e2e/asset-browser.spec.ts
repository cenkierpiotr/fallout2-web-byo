import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, debugState, makeBrokenGameDir, openGame } from './helpers';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

test.describe('przegladarka assetow', () => {
  // Ladowanie ~560 MB przez input trwa, wiec folder gry otwieramy raz na projekt
  // (wspolna strona); testy bez gry uzywaja swiezej strony.
  test.describe.configure({ mode: 'serial' });
  let shared: Page;
  let sharedErrors: string[] = [];
  let errors: string[] = [];
  test.beforeAll(async ({ browser }, info) => {
    const ctx = await browser.newContext(info.project.use);
    shared = await ctx.newPage();
    sharedErrors = collectErrors(shared);
    await openGame(shared);
  });
  test.afterAll(async () => {
    await shared.context().close();
  });
  test.beforeEach(({ page }) => {
    errors = collectErrors(page);
  });
  test.afterEach(() => {
    expect(errors, 'bledy konsoli').toEqual([]);
    expect(sharedErrors, 'bledy konsoli (strona z gra)').toEqual([]);
  });

  test('otwiera folder i listuje tiles', async () => {
    const page = shared;
    await page.getByTestId('category-select').selectOption('tiles');
    await expect(page.getByTestId('frm-list')).toHaveAttribute('data-count', '3102');
    // wirtualizacja: w DOM tylko okno wierszy, nie 3102
    const rendered = await page.locator('[data-testid^=frm-item-]').count();
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(200);
    // cache indeksu w IndexedDB
    const keys = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const r = indexedDB.open('fallout2-web');
          r.onerror = () => reject(r.error);
          r.onsuccess = () => {
            const db = r.result;
            if (!db.objectStoreNames.contains('kv')) return resolve(-1);
            const c = db.transaction('kv').objectStore('kv').count();
            c.onsuccess = () => resolve(c.result);
            c.onerror = () => reject(c.error);
          };
        }),
    );
    expect(keys).toBeGreaterThan(0);
  });

  test('renderuje EDG1001', async () => {
    const page = shared;
    await page.getByTestId('category-select').selectOption('tiles');
    await page.getByTestId('search-input').fill('EDG1001');
    await page.getByTestId('frm-item-EDG1001.FRM').click();
    await expect.poll(async () => (await debugState(page)).spriteCount).toBe(1);
    await page.waitForTimeout(500);
    // canvas nie jest jednolity: piksel w srodku (sprite) rozni sie od rogu (tlo)
    const px = await page.getByTestId('preview-canvas').evaluate((c: HTMLCanvasElement) => {
      const copy = document.createElement('canvas');
      copy.width = c.width;
      copy.height = c.height;
      const ctx = copy.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(c, 0, 0);
      const at = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
      return { corner: at(2, 2), center: at(c.width >> 1, c.height >> 1) };
    });
    expect(px).not.toBeNull();
    expect(px?.center).not.toEqual(px?.corner);
  });

  test('animuje HMJMPSAA', async () => {
    const page = shared;
    await page.getByTestId('category-select').selectOption('critters');
    await page.getByTestId('search-input').fill('HMJMPSAA');
    await page.getByTestId('frm-item-HMJMPSAA.FRM').click();
    await expect.poll(async () => (await debugState(page)).spriteCount).toBe(1);
    const first = (await debugState(page)).frameIndex;
    await page.waitForTimeout(500);
    const second = await debugState(page);
    expect(second.frameIndex).not.toBe(first);
    expect(second.fps).toBe(8);
    await page.getByTestId('dir-3').click();
    await page.waitForTimeout(300);
    expect((await debugState(page)).spriteCount).toBe(1);
  });

  test('brak pliku: komunikat o CRITTER.DAT', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('[data-testid=pick-folder-input]', makeBrokenGameDir());
    await expect(page.getByTestId('status-text')).toContainText('CRITTER.DAT');
  });

  test('anulowanie wyboru zostawia ekran wyboru', async ({ page }) => {
    await page.goto('/');
    // Playwright nie pozwala na setInputFiles([]) dla webkitdirectory: emulujemy anulowanie (change bez plikow)
    await page.getByTestId('pick-folder-input').dispatchEvent('change');
    await expect(
      page.getByRole('button', { name: /(Wskaż folder gry|Pick game folder)/ }),
    ).toBeVisible();
  });

  // eslint-disable-next-line no-empty-pattern
  test("100 sprite'ow 60 fps", async ({}, info) => {
    test.skip(info.project.name !== 'desktop', 'tylko desktop');
    const page = shared;
    await page.getByTestId('category-select').selectOption('tiles');
    await page.getByTestId('search-input').fill('EDG1001');
    await page.getByTestId('frm-item-EDG1001.FRM').click();
    await expect.poll(async () => (await debugState(page)).spriteCount).toBe(1);
    await page.getByTestId('stress-100').check();
    await expect.poll(async () => (await debugState(page)).spriteCount).toBe(100);
    const avg = await page.evaluate(
      () =>
        new Promise<{ cost: number; delta: number }>((resolve) => {
          const dbg = (
            window as unknown as { __f2debug: { lastFrameMs: number; frameDeltaMs: number } }
          ).__f2debug;
          const cost: number[] = [];
          const delta: number[] = [];
          const t0 = performance.now();
          const tick = () => {
            cost.push(dbg.lastFrameMs);
            if (dbg.frameDeltaMs > 0) delta.push(dbg.frameDeltaMs);
            if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
            else {
              const m = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
              resolve({ cost: m(cost), delta: m(delta) });
            }
          };
          requestAnimationFrame(tick);
        }),
    );
    console.log(
      `stress-100: koszt klatki ${avg.cost.toFixed(2)} ms, odstep ${avg.delta.toFixed(2)} ms`,
    );
    expect(avg.cost).toBeLessThan(16.7);
  });

  // eslint-disable-next-line no-empty-pattern
  test('mobile: profil dotykowy, cele >= 44 px, brak poziomego scrolla', async ({}, info) => {
    test.skip(info.project.name !== 'mobile', 'tylko mobile');
    const page = shared;
    await expect(page.locator('html')).toHaveAttribute('data-profile', 'touch');
    const box = await page.getByTestId('dir-0').boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('i18n: przelaczenie na angielski', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('lang-en').click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/asset browser/i);
  });
});
