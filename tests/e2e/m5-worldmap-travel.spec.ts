import { appendFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { GAME_DIR, collectErrors, openGame, finishCreator } from './helpers';
import { game, presetStorage } from './map-helpers';
import { walkCavesToVillage } from './arroyo-route';

const log = (m: string): void => {
  console.log(m);
  if (process.env['F2_PROGRESS_LOG'])
    appendFileSync(process.env['F2_PROGRESS_LOG'], `${new Date().toISOString()} ${m}\n`);
};

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

/**
 * M5 (Z35) bez skrotow: ARTEMPLE -> exit grid -> ARCAVES -> ARVILLAG (Arroyo) -> exit grid destMap<0
 * -> mapa swiata -> wybor miasta w UI -> wejscie do KLAMATH (KLADWTWN) -> exit grid -> mapa swiata -> Den.
 * Zadnego `travelTo`.
 */

async function startNewGame(page: Page): Promise<void> {
  await presetStorage(page, 2);
  await page.addInitScript(() => localStorage.setItem('locale', 'pl'));
  await openGame(page);
  await page.getByTestId('tab-play').click();
  await expect(page.getByTestId('main-menu-screen')).toBeVisible();
  await page.getByTestId('menu-new').click();
  await expect(page.getByTestId('creator-screen')).toBeVisible({ timeout: 60_000 });
  await page
    .getByRole('button', { name: /Wybierz postać:/ })
    .first()
    .click();
  await finishCreator(page);
  await expect(page.getByTestId('game-shell')).toBeVisible();
  await expect(page.getByTestId('map-name')).toContainText(/ARTEMPLE/i, { timeout: 90_000 });
}

interface ExitGrid {
  hex: number;
  destMap: number;
  elevation: number;
}

const mapNameNow = (page: Page): Promise<string> => game(page, (g) => g.view.currentMap.value.name);

/** Idzie na exit grid o `destMap` spelniajacym predykat (po `moveTo`), wraca opis wyniku. */
async function walkToExit(page: Page, pred: string): Promise<string> {
  const steps: string[] = [];
  const exits = (await page.evaluate(
    `window.__f2game.map.exitGrids.filter(e => e.elevation === window.__f2game.view.player.value.elevation && (${pred}))
       .map(e => ({hex: e.hex, destMap: e.destMap, elevation: e.elevation}))`,
  )) as ExitGrid[];
  const all = (await page.evaluate(
    `JSON.stringify(window.__f2game.map.exitGrids.map(e => e.elevation + ':' + e.destMap + '@' + e.hex))`,
  )) as string;
  log(
    'exitGrids ' +
      (await mapNameNow(page)) +
      ' gracz ' +
      (await page.evaluate(`JSON.stringify(window.__f2game.view.player.value)`)) +
      ' ' +
      all,
  );
  expect(exits.length, `brak exit gridow dla ${pred} na ${await mapNameNow(page)}`).toBeGreaterThan(
    0,
  );
  for (const e of exits) {
    const r = (await page.evaluate(`window.__f2game.commands.moveTo(${e.hex}, true)`)) as {
      ok: boolean;
      reason?: string;
    };
    steps.push(`${e.hex}: ${JSON.stringify(r)}`);
    if (r.ok) return steps.join(' | ');
  }
  throw new Error('zaden exit grid nieosiagalny: ' + steps.join(' | '));
}

/**
 * Miasta start_state=On sa znane, ale na liscie dopiero po odslonieciu mgly w ich podkaflu (jak w oryginale):
 * klika (clickWorld = ten sam tap co na canvasie) w kierunku miasta i idzie, unikajac spotkan, az pojawi sie na liscie.
 */
async function revealCity(page: Page, cityRe: RegExp): Promise<void> {
  const list = page.getByTestId('worldmap-cities');
  const btn = list.getByRole('button', { name: cityRe });
  const pos = (await page.evaluate(
    `(() => { const m = window.__f2wm.model; const a = m.data.areas.find(a => /${cityRe.source}/i.test(a.name)); return a ? a.worldPos : null; })()`,
  )) as { x: number; y: number } | null;
  expect(pos, 'obszar ' + cityRe + ' w danych mapy swiata').not.toBeNull();
  let iter = 0;
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    if (await btn.isVisible()) return;
    if ((await page.getByTestId('worldmap-screen').count()) === 0) {
      // spotkanie bez promptu wrzuca na mape spotkania: wracamy na mape swiata przyciskiem HUD (cel zostaje)
      log('mapa spotkania ' + (await mapNameNow(page)) + ', wracam na mape swiata');
      await page.getByTestId('worldmap-open').click();
      await page.waitForTimeout(2000);
      continue;
    }
    const avoid = page.getByTestId('worldmap-encounter-avoid');
    if (await avoid.isVisible()) {
      log('spotkanie: unikam');
      await avoid.click();
    }
    if (++iter % 20 === 0)
      log(
        'reveal ' +
          cityRe +
          ' ' +
          (await page.evaluate(
            `JSON.stringify({x: window.__f2wm.model.x, y: window.__f2wm.model.y, t: window.__f2wm.model.target, map: window.__f2game.view.currentMap.value.name, wm: !!document.querySelector('[data-testid=worldmap-screen]')})`,
          )),
      );
    const idle = (await page.evaluate(`window.__f2wm.model.target === null`)) as boolean;
    if (idle) await page.evaluate(`window.__f2wm.clickWorld(${pos!.x}, ${pos!.y})`);
    await page.waitForTimeout(1000);
  }
}

/** Wybiera miasto o nazwie z listy w UI mapy swiata, czeka na dojscie i wchodzi do lokacji `mapName`. */
async function travelToCityAndEnter(
  page: Page,
  cityRe: RegExp,
  enterRe: RegExp,
  mapName: string,
): Promise<void> {
  const list = page.getByTestId('worldmap-cities');
  await expect(list).toBeVisible();
  // Math.random zwraca ~1: rng mapy swiata nie trafia progow spotkan, wiec podroz jest deterministyczna
  // (spotkanie bez promptu wrzucalo na mape z walka i test sie zapetlal). Przywracane po wejsciu do lokacji.
  await page.evaluate(`window.__origRandom = Math.random; Math.random = () => 0.99999;`);
  const btn = list.getByRole('button', { name: cityRe });
  await revealCity(page, cityRe);
  await expect(btn, 'miasto na liscie mapy swiata').toBeVisible({ timeout: 30_000 });
  await btn.click();
  const enter = page.locator('[data-testid^=worldmap-enter-]', { hasText: enterRe });
  await expect(enter.first(), 'przycisk wejscia po dojsciu').toBeEnabled({ timeout: 240_000 });
  await enter.first().click();
  await expect(page.getByTestId('worldmap-screen')).toHaveCount(0);
  await page.evaluate(`Math.random = window.__origRandom;`);
  await expect
    .poll(() => page.evaluate(`window.__f2game.map.name`), { timeout: 300_000 })
    .toBe(mapName);
  await expect.poll(() => mapNameNow(page)).toBe(mapName);
}

test.describe('M5: przejscia przez mape swiata', () => {
  test('ARTEMPLE -> ARCAVES -> ARVILLAG -> mapa swiata -> KLADWTWN -> mapa swiata -> Den', async ({
    page,
  }) => {
    test.setTimeout(1_200_000);
    const errors = collectErrors(page);
    await startNewGame(page);

    // 1. exit grid ARTEMPLE -> ARCAVES, dalej jaskinie -> ARVILLAG (bez travelTo)
    const caves = await walkToExit(page, 'e.destMap === 3');
    log('ARTEMPLE->ARCAVES ' + caves);
    await expect.poll(() => mapNameNow(page), { timeout: 120_000 }).toBe('ARCAVES');
    log('w ARCAVES');
    await walkCavesToVillage(page);
    log('w ARVILLAG');
    expect(await mapNameNow(page)).toBe('ARVILLAG');

    // 2. wyjscie z Arroyo: ARVILLAG -> ARBRIDGE (maps.txt [Map 005]) -> exit grid z destMap<0 otwiera mape swiata
    log('ARVILLAG->ARBRIDGE ' + (await walkToExit(page, 'e.destMap === 5')));
    await expect
      .poll(() => page.evaluate(`window.__f2game.map.name`), { timeout: 300_000 })
      .toBe('ARBRIDGE');
    await expect.poll(() => mapNameNow(page)).toBe('ARBRIDGE');
    log('ARBRIDGE->swiat ' + (await walkToExit(page, 'e.destMap < 0')));
    await expect(page.getByTestId('worldmap-screen')).toBeVisible({ timeout: 300_000 });

    // 3. Klamath przez UI mapy swiata
    const t0 = await game(
      page,
      (g) =>
        (g as unknown as { session: { world: { clock: { ticks: number } } } }).session.world.clock
          .ticks,
    );
    await travelToCityAndEnter(page, /Klamath/i, /Klamath Downtown/i, 'KLADWTWN');
    const t1 = await game(
      page,
      (g) =>
        (g as unknown as { session: { world: { clock: { ticks: number } } } }).session.world.clock
          .ticks,
    );
    expect(t1, 'podroz przesunela zegar gry').toBeGreaterThan(t0);

    // 4. Klamath -> mapa swiata (exit grid) -> Den
    log('KLADWTWN->swiat ' + (await walkToExit(page, 'e.destMap < 0')));
    await expect(page.getByTestId('worldmap-screen')).toBeVisible({ timeout: 90_000 });
    await travelToCityAndEnter(page, /^Den$/i, /Den Business 1/i, 'DENBUS1');

    expect(errors.filter((e) => !/favicon|WebGL|GPU/i.test(e))).toEqual([]);
  });
});
