import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMapsTxt } from '../../screens/map/maps-txt';
import { WorldmapModel, type EncounterEvent, type TravelEnv } from './worldmap-model';
import { buildWorldmapData, mapNameOf } from './worldmap-data';
import { CombatSession } from '../combat';
import {
  planCombatRequest,
  planEncounterGroup,
  spawnGroup,
  type GroupSpawner,
} from './worldmap-group';

// Spotkania losowe (O7) na prawdziwych WORLDMAP.TXT / CITY.TXT / MAPS.TXT: spojnosc danych i symulacja podrozy.
const dir = process.env['F2_PATCH_DIR'] ?? '';
const read = (n: string): string => {
  try {
    return readFileSync(`${dir}/DATA/Data/${n}`, 'latin1');
  } catch {
    return '';
  }
};
const have = read('WORLDMAP.TXT') !== '' && read('CITY.TXT') !== '' && read('MAPS.TXT') !== '';

const lcg = (seed: number) => {
  let s = seed >>> 0;
  return {
    int(min: number, max: number) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return min + ((s >>> 8) % (max - min + 1));
    },
  };
};

describe.skipIf(!have)('spotkania losowe: prawdziwe dane', () => {
  const data = buildWorldmapData(
    read('WORLDMAP.TXT'),
    read('CITY.TXT'),
    parseMapsTxt(read('MAPS.TXT')),
  );
  const { cfg } = data;

  it('kazda komorka wskazuje istniejaca tabele, a czestotliwosci sa znane', () => {
    const names = new Set(cfg.tables.map((t) => t.lookupName.toLowerCase()));
    const freq = new Set(Object.keys(cfg.data.frequencies));
    const missing = new Set<string>();
    for (const t of cfg.tiles)
      for (const row of t.cells)
        for (const c of row) {
          for (const f of [c.morning, c.afternoon, c.night]) expect(freq.has(f), f).toBe(true);
          if (!names.has(c.encTable.toLowerCase())) missing.add(c.encTable);
        }
    expect([...missing]).toEqual([]);
  });

  it('mapy tabel i wpisow Special rozwiazuja sie do plikow z maps.txt, losowe mapy terenu tez', () => {
    const bad: string[] = [];
    for (const t of cfg.tables) {
      for (const m of t.maps)
        if (!mapNameOf(data.maps, m)) bad.push(`tabela ${t.lookupName}: ${m}`);
      for (const e of t.entries)
        if (e.map && !mapNameOf(data.maps, e.map)) bad.push(`wpis ${t.lookupName}: ${e.map}`);
    }
    for (const [terrain, list] of Object.entries(cfg.randomMaps))
      for (const m of list) if (!mapNameOf(data.maps, m)) bad.push(`teren ${terrain}: ${m}`);
    expect(bad).toEqual([]);
  });

  it('kazda grupa wpisu istnieje w [Encounter:] (bez wzgledu na wielkosc liter)', () => {
    const lower = new Set([...cfg.encounters.keys()].map((k) => k.toLowerCase()));
    const bad: string[] = [];
    for (const t of cfg.tables)
      for (const e of t.entries)
        for (const g of e.encounters) if (!lower.has(g.name.toLowerCase())) bad.push(g.name);
    expect([...new Set(bad)]).toEqual([]);
  });

  it('plan grupy dla kazdego wpisu niespecjalnego daje czlonkow w obrebie liczebnosci', () => {
    const encounters = new Map([...cfg.encounters].map(([k, v]) => [k.toLowerCase(), v]));
    const lcfg = {
      encounters: {
        get: (k: string) => encounters.get(k.toLowerCase()),
      } as unknown as typeof cfg.encounters,
    };
    const rng = lcg(7);
    let planned = 0;
    const empty: string[] = [];
    for (const t of cfg.tables)
      for (const e of t.entries) {
        if (e.special || e.encounters.length === 0) continue;
        const members = planEncounterGroup(
          lcfg,
          { groups: e.encounters, ...(e.relations ? { relations: e.relations } : {}) },
          20100,
          {
            rng,
            player: () => 40,
            global: () => 0,
            time: () => 1300,
            free: () => true,
          },
        );
        if (members.length === 0)
          empty.push(`${t.lookupName}:${e.encounters.map((g) => g.name).join('+')}`);
        for (const m of members) expect(m.hex).toBeGreaterThanOrEqual(0);
        planned++;
      }
    expect(planned).toBeGreaterThan(100);
    expect(empty).toEqual([]);
  });

  it('walka w spotkaniu: kazdy wpis z relacja (grupa->gracz, grupa->grupa) otwiera poprawna CombatSession', () => {
    const encounters = new Map([...cfg.encounters].map(([k, v]) => [k.toLowerCase(), v]));
    const lcfg = {
      encounters: {
        get: (k: string) => encounters.get(k.toLowerCase()),
      } as unknown as typeof cfg.encounters,
    };
    const PLAYER = 1;
    const rng = lcg(11);
    let withRequest = 0;
    let ambushPlayer = 0;
    for (const t of cfg.tables)
      for (const e of t.entries) {
        if (e.special || e.encounters.length === 0 || !e.relations) continue;
        let next = 100;
        const spawner = {
          createObject: () => next++,
          critterAddTrait: () => undefined,
          addMultObjsToInven: () => undefined,
          wieldObjCritter: () => undefined,
        } as unknown as GroupSpawner;
        const members = planEncounterGroup(
          lcfg,
          { groups: e.encounters, relations: e.relations },
          20100,
          { rng, player: () => 40, global: () => 0, time: () => 1300, free: () => true },
        );
        const firstByGroup = new Map<number, number>();
        const ids = spawnGroup(spawner, members, 0, { player: 20000, firstByGroup });
        const req = planCombatRequest(e.relations, firstByGroup, PLAYER);
        const parts = [
          {
            id: PLAYER,
            team: 0,
            hp: 30,
            maxAp: 8,
            sequence: 9,
            agility: 5,
            hex: 20000,
            isPlayer: true,
          },
          ...ids.map((id, i) => ({
            id,
            team: 1,
            hp: 10,
            maxAp: 8,
            sequence: 1,
            agility: 5,
            hex: 20100 + i,
            isPlayer: false,
          })),
        ];
        const session = new CombatSession(
          parts,
          () => ({ hit: true, damage: 1 }),
          (a, b) => Math.abs(a - b),
          req ? { request: req } : {},
        );
        const where = `${t.lookupName}:${e.encounters.map((g) => g.name).join('+')}`;
        expect(session.all.length, where).toBe(ids.length + 1);
        if (req) {
          withRequest++;
          expect(ids, where).toContain(req.attacker);
          expect(session.current.id, where).toBe(req.attacker);
          if (req.defender === PLAYER) ambushPlayer++;
        }
      }
    expect(withRequest).toBeGreaterThan(0);
    expect(ambushPlayer).toBeGreaterThan(0);
  });

  it('symulacja podrozy po calej mapie: spotkania wystepuja, mapy sie rozwiazuja, wynik deterministyczny', () => {
    const run = (seed: number) => {
      const rng = lcg(seed);
      const m = new WorldmapModel(data, { x: 20, y: 20 });
      const evs: EncounterEvent[] = [];
      const env = (): TravelEnv => ({
        rng,
        hhmm: [800, 1300, 2200][rng.int(0, 2)]!,
        gameTicks: 0,
        difficulty: 1,
        luck: 5,
        outdoorsman: 30,
        pathfinder: 0,
        perks: { explorer: 0, ranger: 0, scout: 0 },
        gvars: {},
        player: () => 6,
      });
      const corners: [number, number][] = [
        [1380, 20],
        [1380, 1480],
        [20, 1480],
        [20, 20],
      ];
      for (const [x, y] of corners) {
        m.setTarget(x, y);
        for (let i = 0; i < 4000 && m.target; i++)
          for (const e of m.iterate(env()).events) if (e.kind === 'encounter') evs.push(e);
      }
      return evs;
    };
    const a = run(3);
    expect(a.length).toBeGreaterThan(0);
    for (const e of a) {
      expect(e.tableIndex).toBeGreaterThanOrEqual(0);
      if (!e.special) expect(e.groups.length).toBeGreaterThan(0);
      expect(e.mapName, `tabela ${e.tableIndex} wpis ${e.entryIndex}`).toBeDefined();
    }
    expect(run(3)).toEqual(a);
  });
});
