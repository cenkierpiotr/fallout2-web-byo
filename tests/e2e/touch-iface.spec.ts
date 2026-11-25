import { test, expect } from '@playwright/test';
import { GAME_DIR } from './helpers';
import { game, openMap, presetStorage } from './map-helpers';

/** Dotyk 873x393: prawdziwy tap w przycisk paska IFACE oraz brak "ducha klikniecia" po tapie na NPC. */
test('dotyk: tap w open-saves i duch klikniecia w dialogu', async ({ page }, testInfo) => {
  test.setTimeout(500000);
  test.skip(!GAME_DIR, 'brak F2_GAME_DIR');
  await presetStorage(page, 1);
  await page.addInitScript(() => {
    localStorage.setItem('f2.game', 'f2');
    localStorage.setItem('f2.onboarding', JSON.stringify({ step: 5, done: true, v: 1 }));
  });
  await page.goto('/');
  await page.setInputFiles('[data-testid=pick-folder-input]', GAME_DIR!);
  await page.waitForFunction(
    () =>
      /Zaindeksowano wpisów: \d{5}/.test(
        document.querySelector('[data-testid=status-text]')?.textContent ?? '',
      ),
    undefined,
    { timeout: 150000 },
  );
  await page.getByTestId('tab-maps').click();
  await page.getByTestId('map-list').waitFor({ timeout: 60000 });
  await openMap(page, 'ARTEMPLE');
  await page.waitForTimeout(1500);

  // 1) tap w open-saves otwiera zapisy za kazdym razem i nie wysyla gracza w marsz
  const hex0 = await game(page, (g) => g.player.hex);
  const saves = page.getByTestId('open-saves');
  for (let i = 0; i < 2; i++) {
    await saves.tap({ timeout: 5000 });
    await expect(page.getByTestId('saves-screen')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('saves-screen')).toHaveCount(0);
  }
  await page.waitForTimeout(800);
  expect(await game(page, (g) => g.player.hex)).toBe(hex0);

  // 2) duch klikniecia: NPC ustawiony dokladnie pod pierwsza opcja dialogu
  type TouchTestGame = {
    hexToClient(hex: number): { x: number; y: number };
    objectByScript(id: number): { hex: number };
    placePlayerNear(hex: number): void;
    centerOn(hex: number): void;
  };
  const npcPt = () =>
    game(page, (g) => {
      const gg = g as unknown as TouchTestGame;
      return gg.hexToClient(gg.objectByScript(0x4000001).hex);
    });
  await game(page, (g) => {
    const gg = g as unknown as TouchTestGame;
    gg.placePlayerNear(gg.objectByScript(0x4000001).hex);
    gg.centerOn(gg.objectByScript(0x4000001).hex);
  });
  const place = async (tgt: { x: number; y: number }) => {
    const cur = await npcPt();
    await page.evaluate(
      `(function(){const g=window.__f2game; g.iso.x += ${cur.x - tgt.x}; g.iso.y += ${cur.y - tgt.y};})()`,
    );
    await page.waitForTimeout(500);
    return npcPt();
  };
  const free = (y0: number, y1: number): Promise<{ x: number; y: number } | null> =>
    page.evaluate(
      `(()=>{for(let y=${y0};y<=${y1};y+=6)for(let x=40;x<840;x+=20){const e=document.elementFromPoint(x,y);if(e&&e.tagName==='CANVAS')return {x,y};}return null})()`,
    ) as Promise<{ x: number; y: number } | null>;
  // Punkt na canvasie w pasie, w ktorym dialog rysuje pierwsza opcje (okno dialogu jest nad paskiem IFACE).
  const spot = await free(205, 245);
  test.skip(!spot, 'brak wolnego punktu mapy w pasie opcji dialogu');
  const pt = await place(spot!);
  await page.touchscreen.tap(pt.x, pt.y);
  await page.getByTestId('dialog-screen').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  // Zrzut diagnostyczny do outputDir konfiguracji (playwright sam tworzy katalog i czyści go przed uruchomieniem).
  await page.screenshot({ path: testInfo.outputPath('touch-ghost-click.png') });
  // bez poprawki click po tapie wybieral pierwsza opcje i dialog przeskakiwal do ostatniego wezla (0 opcji)
  expect(await page.locator('[data-testid^=dialog-option-]').count()).toBeGreaterThan(0);
});
