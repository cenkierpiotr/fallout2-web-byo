import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const row = (page: Page, col: string, id: number) =>
  page.locator(`[data-testid=${col}] [data-testid=barter-item][data-item-id="${id}"]`);
const log = (page: Page) =>
  page.evaluate(() => (window as unknown as { __barterLog: string[] }).__barterLog.slice());
const status = (page: Page) => page.getByTestId('barter-status');

async function open(page: Page, query = '') {
  await page.goto(`/?view=barter${query}`);
  await page.waitForSelector('[data-testid=barter-screen]');
}

async function center(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`brak elementu ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('handel', () => {
  test('axe: 0 serious/critical', async ({ page }) => {
    await open(page);
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const bad = res.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical');
    expect(
      bad.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
    ).toEqual([]);
  });

  test('klik: wystaw, zwroc, zbilansuj i handluj', async ({ page }) => {
    await open(page);
    await row(page, 'barter-merchant-inv', 6).click();
    await row(page, 'barter-player-inv', 2).click();
    await expect(page.getByTestId('barter-balance')).toContainText('Zbilansowane');
    await page.getByRole('button', { name: 'Handluj' }).click();
    await expect(status(page)).toHaveText('Transakcja zakończona.');
    await expect(row(page, 'barter-player-inv', 6)).toBeVisible();
    await expect(row(page, 'barter-merchant-inv', 2)).toBeVisible();
  });

  test('filtr kategorii i wyrownaj', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Broń' }).click();
    await expect(
      page.locator('[data-testid=barter-merchant-inv] [data-testid=barter-item]'),
    ).toHaveCount(1);
    await page.getByRole('tab', { name: 'Wszystko' }).click();
    await row(page, 'barter-merchant-inv', 5).click();
    await page.getByRole('button', { name: 'Wyrównaj' }).click();
    expect(await log(page)).toContain('balance');
    await expect(page.getByTestId('barter-balance')).toContainText('Zbilansowane');
    await expect(page.getByTestId('barter-offer')).toHaveText('400');
    await page.getByRole('button', { name: 'Handluj' }).click();
    await expect(status(page)).toHaveText('Transakcja zakończona.');
  });

  test('odmowa: kupiec nie uniesie (tryb pojemnika)', async ({ page }) => {
    await open(page, '&container=1&merchantCarry=1');
    await row(page, 'barter-player-inv', 2).click();
    await page.getByRole('button', { name: 'Handluj' }).click();
    await expect(status(page)).toHaveText('Kupiec nie uniesie Twoich przedmiotów.');
  });

  test('stos: wybor ilosci klawiatura (Enter, pole, Zatwierdz)', async ({ page }, info) => {
    test.skip(info.project.name !== 'ui-desktop', 'klawiatura: profil desktop');
    await open(page);
    await row(page, 'barter-player-inv', 3).focus();
    await page.keyboard.press('Enter');
    await page.getByTestId('barter-qty-input').fill('2');
    await page.getByRole('button', { name: 'Zatwierdź' }).click();
    expect(await log(page)).toContain('move:player:3:2:table');
    await expect(row(page, 'barter-player-table', 3)).toContainText('x2');
  });

  test('odmowa: zbyt niska oferta i przedmiot nie na sprzedaz', async ({ page }) => {
    await open(page);
    await row(page, 'barter-merchant-inv', 6).click();
    await page.getByRole('button', { name: 'Handluj' }).click();
    await expect(status(page)).toContainText('zbyt niska');
    await row(page, 'barter-player-inv', 4).click();
    await expect(status(page)).toContainText('nie jest na sprzedaż');
  });

  test('odmowa: przekroczony udzwig', async ({ page }) => {
    await open(page, '&weightMax=20');
    await row(page, 'barter-merchant-inv', 8).click();
    await row(page, 'barter-player-inv', 2).click();
    await page.getByRole('button', { name: 'Handluj' }).click();
    await expect(status(page)).toContainText('udźwig');
  });

  test('mysz: przeciagniecie na stol i z powrotem', async ({ page }, info) => {
    test.skip(info.project.name !== 'ui-desktop', 'mysz: profil desktop');
    await open(page, '&compact=0');
    const from = await center(page, '[data-testid=barter-player-inv] [data-item-id="2"]');
    const to = await center(page, '[data-testid=barter-player-table]');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + 10, { steps: 4 });
    await expect(page.getByTestId('drag-ghost')).toHaveCount(1);
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
    expect(await log(page)).toContain('move:player:2:1:table');
    await expect(row(page, 'barter-player-table', 2)).toBeVisible();
    const back = await center(page, '[data-testid=barter-player-table] [data-item-id="2"]');
    const inv = await center(page, '[data-testid=barter-player-inv]');
    await page.mouse.move(back.x, back.y);
    await page.mouse.down();
    await page.mouse.move(back.x + 20, back.y + 10, { steps: 4 });
    await page.mouse.move(inv.x, inv.y, { steps: 8 });
    await page.mouse.up();
    expect(await log(page)).toContain('move:player:2:1:inventory');
    await expect(row(page, 'barter-player-inv', 2)).toBeVisible();
  });

  test('dotyk: przeciaganie po dlugim przytrzymaniu (pointer events) oraz tap', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'ui-desktop', 'dotyk: profile mobile i tablet');
    await open(page, '&compact=0');
    // tap
    await row(page, 'barter-merchant-inv', 6).tap();
    expect(await log(page)).toContain('move:merchant:6:1:table');
    // przeciagniecie dotykiem: wlasna kolumna docelowa musi byc w widoku
    await page.locator('[data-testid=barter-player-table]').scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const src = document.querySelector('[data-testid=barter-player-inv] [data-item-id="2"]')!;
      src.scrollIntoView({ block: 'center' });
    });
    const from = await center(page, '[data-testid=barter-player-inv] [data-item-id="2"]');
    const to = await center(page, '[data-testid=barter-player-table]');
    await page.evaluate(
      async ({ from, to }) => {
        const src = document.querySelector('[data-testid=barter-player-inv] [data-item-id="2"]')!;
        const fire = (type: string, p: { x: number; y: number }) =>
          src.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              cancelable: true,
              pointerId: 9,
              pointerType: 'touch',
              clientX: p.x,
              clientY: p.y,
            }),
          );
        const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
        fire('pointerdown', from);
        await wait(320);
        for (let i = 1; i <= 6; i++)
          fire('pointermove', {
            x: from.x + ((to.x - from.x) * i) / 6,
            y: from.y + ((to.y - from.y) * i) / 6,
          });
        fire('pointerup', to);
      },
      { from, to },
    );
    await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
    expect(await log(page)).toContain('move:player:2:1:table');
  });
});
