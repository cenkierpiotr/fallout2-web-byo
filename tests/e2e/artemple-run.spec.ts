import { expect, test } from '@playwright/test';
import { GAME_DIR, collectErrors } from './helpers';
import { ACCEPTED_UNSUPPORTED, Macro } from './macro';
import { walkCavesToVillage } from './arroyo-route';

test.skip(!GAME_DIR, 'brak F2_GAME_DIR (testy tylko lokalnie, pliki gry nie sa w repo)');

/** Heks startowy gracza w ARTEMPLE (plan M3, Zadanie 35). */
const START_HEX = 18492;
const ARCAVES_INDEX = 3;

test.describe('przebieg ARTEMPLE', () => {
  test('deterministyczny marsz przez swiatynie do wyjscia, 0 VmError (seed 42)', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    const errors = collectErrors(page);
    // deterministyczna losowosc: mulberry32, seed 42, zanim ruszy jakikolwiek skrypt
    await page.addInitScript(() => {
      let s = 42 >>> 0;
      Math.random = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    });
    const m = await Macro.start(page, 'ARTEMPLE');

    const start = await page.evaluate(`window.__f2game.view.player.value.hex`);
    expect(start).toBe(START_HEX);

    // trasa: wejscia exit gridow z mapy, wyjscie do ARCAVES (poludniowe wyjscia do ARVILLAG sa odciete jednoheksowym korkiem: drzewo 0x20003b3 na heksie 21899, patrz report-z35b)
    const exits = (await page.evaluate(
      `window.__f2game.map.exitGrids.map(e => ({hex: e.hex, destMap: e.destMap, elevation: e.elevation}))`,
    )) as { hex: number; destMap: number; elevation: number }[];
    const toCaves = exits.filter((e) => e.destMap === ARCAVES_INDEX);
    expect(toCaves.length).toBeGreaterThan(0);

    // marsz etapami: najpierw do Klinta (srodek swiatyni), potem do wyjscia
    const klintHex = (await page.evaluate(
      `window.__f2game.objectByScript(0x4000001).hex`,
    )) as number;
    let reached = false;
    const steps: string[] = [];
    for (const target of [klintHex, ...toCaves.map((e) => e.hex)]) {
      const near = target === klintHex ? await neighbour(page, klintHex) : target;
      const r = await m.moveTo(near).catch(() => ({ ok: false, reason: 'timeout' }));
      steps.push(`${target}->${near}: ${JSON.stringify(r)}`);
      if (!r.ok) continue;
      if (target !== klintHex) {
        reached = true;
        break;
      }
    }
    expect(reached, steps.join(' | ') + ' exits=' + JSON.stringify(exits)).toBe(true);

    // wejscie na exit grid przenosi do ARCAVES
    await page.waitForFunction(
      () =>
        (window as unknown as { __f2game: { view: { currentMap: { value: { name: string } } } } })
          .__f2game.view.currentMap.value.name === 'ARCAVES',
      undefined,
      { timeout: 90_000 },
    );

    // dalej przez ARCAVES (3 kondygnacje) do ARVILLAG
    await walkCavesToVillage(page);

    expect(await m.vmErrors()).toEqual([]);
    const uns = await m.unsupported();
    expect(uns.filter((u) => !ACCEPTED_UNSUPPORTED.some((re) => re.test(u)))).toEqual([]);
    expect(errors.filter((e) => !/WebGL|swiftshader|GPU/i.test(e))).toEqual([]);
  });
});

async function neighbour(page: import('@playwright/test').Page, hex: number): Promise<number> {
  return (await page.evaluate(`(() => {
    const g = window.__f2game; const before = g.view.player.value.hex;
    g.placePlayerNear(${hex}); const h = g.view.player.value.hex;
    g.placePlayerNear(before); return h;
  })()`)) as number;
}
