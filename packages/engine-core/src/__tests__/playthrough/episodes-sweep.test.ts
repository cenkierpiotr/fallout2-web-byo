/**
 * Bramka O1-O7 czesc (b): wejscie na KAZDA mape z manifestu odcinkow (tools/campaign/src/episodes.json), nie tylko
 * wejsciowa. Start skryptow + map_enter + kilka tickow + map_update; asercja = brak bledow VM / nieobslugiwanych opkodow.
 */
import { existsSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, GAME_DIR, type Playthrough } from './harness.js';

interface Episode {
  id: string;
  maps: string[];
}
const episodesUrl = new URL('../../../../../tools/campaign/src/episodes.json', import.meta.url);
const episodes = existsSync(episodesUrl)
  ? (JSON.parse(readFileSync(episodesUrl, 'utf8')) as Episode[]).map((e) => ({
      id: e.id,
      maps: e.maps.filter((m) => !m.includes('*')),
    }))
  : [];

// Znane, zgodne z oryginalem wyjatki (patrz dokumentacja techniczna): ccgrdpa zapisuje guardN_obj bez eksportu.
// rcfitrat ("Fighter ") i siexit ("numDeathclaws") to ten sam wzorzec: skrypt czyta/zapisuje zmienna zewnetrzna innego,
// niezaladowanego skryptu (w oryginale cichy no-op/0), nie blad silnika.
const KNOWN =
  /store_external: zmienna zewnetrzna "guard\d_obj"|zmienna zewnetrzna "Fighter "|zmienna zewnetrzna "numDeathclaws"|rcfitrat:\w+@\d+ op=0x8015: store_external/;
// Mapy wymienione w manifescie, ktorych NIE MA w danych (maps/<m>.map nieobecny w MASTER/PATCH): pomijane, odnotowane.
// ncrex i v15entb: wpis w MAPS.TXT bez maps/<m>.map i bez scripts/<m>.int w MASTER/PATCH/DATA (wyciete z gry).
const MISSING_IN_DATA = new Set(['ncrex', 'v15entb']);
// bhrndmnt: literowka w MAPS.TXT (map 095). Realny plik to maps/bhrndmtn.map + scripts/bhrndmtn.int.
const MAP_ALIAS = new Map([['bhrndmnt', 'bhrndmtn']]);

describe.skipIf(!GAME_DIR)('bramka O1-O7 (b): wszystkie mapy odcinkow w headless', () => {
  let p: Playthrough;
  const entranceTiles = new Map<string, { tile: number; elev: number }>();
  beforeAll(async () => {
    p = await boot();
    const text = Buffer.from(await p.vfs.open('data/city.txt')).toString('latin1');
    for (const raw of text.split(/\r?\n/)) {
      const e = /^entrance_\d+=(?:On|Off),-?\d+,-?\d+,([^,]+),(-?\d+),(-?\d+)/i.exec(
        raw.replace(/;.*/, '').trim(),
      );
      if (e)
        entranceTiles.set(e[1]!.trim().toLowerCase(), { elev: Number(e[2]), tile: Number(e[3]) });
    }
  }, 120_000);
  afterAll(async () => {
    await p?.close();
  });

  for (const ep of episodes) {
    it(`${ep.id}: ${ep.maps.length} map ladowanych bez bledow VM`, async () => {
      const bad: string[] = [];
      for (const m0 of ep.maps) {
        if (MISSING_IN_DATA.has(m0)) continue;
        const m = MAP_ALIAS.get(m0) ?? m0;
        const mark = p.logMark();
        try {
          try {
            await p.enter(m);
          } catch (e) {
            // domyslny kafel naglowka poza mapa (bhrndmnt, ncrex, v15entb): oryginal wchodzi tam z kafla wyjscia/wejscia (city.txt, exit grid)
            if (!/outOfMap/.test((e as Error).message)) throw e;
            const tile = entranceTiles.get(m) ?? { tile: 20100, elev: 0 }; // mapy wewnetrzne: srodek mapy
            await p.enter(m, tile.tile, tile.elev);
          }
          p.tick(20);
          p.rt.scheduler.runMapUpdateAll();
        } catch (e) {
          bad.push(`${m}: WYJATEK ${(e as Error).message}`);
          continue;
        }
        for (const l of p.problems(mark).filter((x) => !KNOWN.test(x))) bad.push(`${m}: ${l}`);
      }
      expect(bad).toEqual([]);
    }, 600_000);
  }
});
