import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMapsTxt } from '../../screens/map/maps-txt';
import { WorldmapModel, type TravelEnv } from './worldmap-model';
import { buildWorldmapData } from './worldmap-data';

// Szlak kampanii na mapie swiata (prawdziwe dane): podroz miedzy kolejnymi miastami konczy sie przybyciem
// (spotkania losowe przerywaja podroz, wiec jest ona wznawiana), a wejscie kazdego obszaru wskazuje mape z maps.txt.
const dir = process.env['F2_PATCH_DIR'] ?? '';
const read = (n: string): string => {
  try {
    return readFileSync(`${dir}/DATA/Data/${n}`, 'latin1');
  } catch {
    return '';
  }
};
const have = read('WORLDMAP.TXT') !== '' && read('CITY.TXT') !== '' && read('MAPS.TXT') !== '';

const SPINE = [
  'Arroyo',
  'Klamath',
  'Den',
  'Modoc',
  'Vault City',
  'Gecko',
  'Broken Hills',
  'New Reno',
  'NCR',
  'Redding',
  'Vault 15',
  'Vault 13',
  'San Francisco',
  'Navarro',
  'Enclave',
];

const lcg = (seed: number) => {
  let s = seed >>> 0;
  return {
    int(min: number, max: number) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return min + ((s >>> 8) % (max - min + 1));
    },
  };
};

describe.skipIf(!have)('szlak kampanii na mapie swiata', () => {
  const data = buildWorldmapData(
    read('WORLDMAP.TXT'),
    read('CITY.TXT'),
    parseMapsTxt(read('MAPS.TXT')),
  );
  const idx = (name: string): number =>
    data.areas.findIndex((a) => a.name.toLowerCase() === name.toLowerCase());

  it('kazdy obszar szlaku istnieje w city.txt i ma wejscie rozwiazujace sie do mapy', () => {
    const bad: string[] = [];
    const m = new WorldmapModel(data);
    for (const name of SPINE) {
      const i = idx(name);
      if (i < 0) {
        bad.push(`brak obszaru ${name}`);
        continue;
      }
      if (!m.entrancesOf(i).some((e) => e.map !== undefined))
        bad.push(`${name}: brak mapy wejscia`);
    }
    expect(bad).toEqual([]);
  });

  it('podroz miedzy kolejnymi miastami szlaku konczy sie przybyciem do celu', () => {
    const rng = lcg(7);
    const env = (): TravelEnv => ({
      rng,
      hhmm: 1200,
      gameTicks: 0,
      difficulty: 0,
      luck: 5,
      outdoorsman: 100,
      pathfinder: 0,
      perks: { explorer: 0, ranger: 0, scout: 0 },
      gvars: {},
      player: () => 6,
    });
    const m = new WorldmapModel(data);
    const failed: string[] = [];
    for (let k = 0; k + 1 < SPINE.length; k++) {
      const from = idx(SPINE[k]!);
      const to = idx(SPINE[k + 1]!);
      m.markKnown(to); // obszary Off odslaniane skryptami/dialogami (Vault 13, Navarro, Enclave)
      m.placeAtArea(from);
      let arrived = false;
      for (let resume = 0; resume < 200 && !arrived; resume++) {
        if (!m.setTargetArea(to)) break;
        for (let i = 0; i < 6000 && m.target; i++) {
          const ev = m.iterate(env()).events;
          if (ev.some((e) => e.kind === 'city' && e.area === to)) arrived = true;
        }
        if (arrived) break;
      }
      if (!arrived) failed.push(`${SPINE[k]} -> ${SPINE[k + 1]}`);
    }
    expect(failed).toEqual([]);
  });
});
