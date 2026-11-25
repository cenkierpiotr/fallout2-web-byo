import { expect, test } from '@playwright/test';
import { GAME_DIR } from './helpers';
import { openMapScreen, presetStorage } from './map-helpers';

// Waski ekran (390 px): panel kopii zapisow nie moze zaslaniac ani przechwytywac klikniec na liscie map.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('mobile 390: panel kopii nie zaslania wierszy listy map', async ({ page }) => {
  test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');
  await presetStorage(page);
  await openMapScreen(page);
  const rows = page.locator('[data-testid^="map-item-"]');
  const n = Math.min(await rows.count(), 6);
  expect(n).toBeGreaterThan(0);
  const panel = page.getByTestId('backup-panel');
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    await row.scrollIntoViewIfNeeded();
    const hit = await row.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return !!top && el.contains(top);
    });
    expect(hit, `wiersz ${i} zasloniety`).toBe(true);
  }
  // panel nie nachodzi na liste
  const pb = await panel.boundingBox();
  const lb = await page.getByTestId('map-list').boundingBox();
  if (pb && lb) expect(lb.y + lb.height).toBeLessThanOrEqual(pb.y + 1);
});
