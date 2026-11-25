import { describe, expect, it } from 'vitest';
import type { EncounterDef, WorldmapConfig } from '@f2/formats';
import { WorldmapModel, type TravelEnv } from './worldmap-model';
import { wmData } from './worldmap-fixture';
import { planEncounterGroup, slotCounts, spawnGroup } from './worldmap-group';
import { WorldmapController, type WorldmapHost } from './worldmap-controller';

const table = {
  index: 0,
  lookupName: 'T',
  maps: ['Arroyo Main'],
  entries: [
    {
      chance: 50,
      encounters: [{ name: 'G', min: 2, max: 2 }],
      special: false,
      relation: 'AMBUSH' as const,
    },
    { chance: 50, encounters: [], special: true, counter: 1, map: 'Klamath Main' },
  ],
};
const data = { ...wmData, cfg: { ...wmData.cfg, tables: [table] } as unknown as WorldmapConfig };
const day = 0xd2f00;
const env = (over: Partial<TravelEnv> = {}): TravelEnv => ({
  rng: { int: (a) => a },
  hhmm: 1000,
  gameTicks: 0,
  difficulty: 1,
  luck: 5,
  outdoorsman: 0,
  pathfinder: 0,
  perks: { explorer: 0, ranger: 0, scout: 0 },
  gvars: {},
  player: () => 5,
  ...over,
});

describe('spotkania specjalne', () => {
  it('po 35 dniach wymusza wpis Special i konczy sie wykonaniem mapy specjalnej', () => {
    const m = new WorldmapModel(data, { x: 10, y: 10 });
    m.setTarget(300, 10);
    const evs = [];
    for (let i = 0; i < 6 && m.target; i++)
      evs.push(...m.iterate(env({ gameTicks: 36 * day })).events);
    const enc = evs.find((e) => e.kind === 'encounter');
    expect(enc).toMatchObject({
      kind: 'encounter',
      special: true,
      mapName: 'KLMAIN',
      prompt: false,
      groups: [],
    });
  });
  it('bez wpisu Special wymuszenie nie psuje podrozy', () => {
    const d = {
      ...data,
      cfg: {
        ...data.cfg,
        tables: [{ ...table, entries: [table.entries[0]!] }],
      } as unknown as WorldmapConfig,
    };
    const m = new WorldmapModel(d, { x: 10, y: 10 });
    m.setTarget(300, 10);
    for (let i = 0; i < 6 && m.target; i++) {
      const evs = m.iterate(env({ gameTicks: 36 * day })).events;
      expect(evs.some((e) => e.kind === 'encounter')).toBe(false);
    }
  });
});

describe('grupa NPC', () => {
  const def = {
    name: 'G',
    teamNum: 3,
    position: { kind: 'Surrounding', spacing: 2, distance: 4 },
    types: [
      { pid: 100, items: [{ pid: 9, min: 2, max: 2, wielded: true }], dead: false, script: 5 },
      { pid: 101, ratio: 100, items: [], dead: false },
    ],
  } as unknown as EncounterDef;
  it('slotCounts (exe 0x4c11fc): bez Ratio = 1, Ratio = max(1, trunc(calosc*ratio/100))', () => {
    expect(slotCounts(def.types, 5)).toEqual([1, 5]);
    expect(slotCounts([{ pid: 1, ratio: 50, items: [], dead: false }], 3)).toEqual([1]);
    expect(slotCounts([{ pid: 1, ratio: 0, items: [], dead: false }], 3)).toEqual([1]);
  });
  it('plan i spawn: pidy, skrypt, team, ekwipunek, wolne heksy', () => {
    const cfg = { encounters: new Map([['G', def]]) };
    const members = planEncounterGroup(cfg, { groups: [{ name: 'G', min: 3, max: 3 }] }, 20100, {
      rng: { int: (a) => a },
      player: () => 8,
      global: () => 0,
      time: () => 1000,
      free: (h) => h !== 20100,
    });
    expect(members.map((x) => x.pid)).toEqual([100, 101, 101, 101]);
    expect(new Set(members.map((x) => x.hex)).size).toBe(4);
    const calls: string[] = [];
    let n = 1;
    const ids = spawnGroup(
      {
        createObject: (pid, _h, _e, sid) => (calls.push(`c${pid}:${sid}`), n++),
        addMultObjsToInven: (w, i, c) => void calls.push(`a${w}:${i}:${c}`),
        wieldObjCritter: (w, i) => void calls.push(`w${w}:${i}`),
        critterAddTrait: (id, k, t, a) => (calls.push(`t${id}:${k}:${t}:${a}`), -1),
      },
      members,
      0,
    );
    expect(ids).toHaveLength(4);
    expect(calls.slice(0, 5)).toEqual(['c100:5', 't1:1:6:3', 'c9:0', 'a1:2:2', 'w1:2']);
  });
});

describe('samochod w kontrolerze', () => {
  const mkHost = (car: NonNullable<WorldmapHost['car']>): WorldmapHost => ({
    ticks: () => 0,
    advance: () => undefined,
    rng: { int: (a) => a },
    difficulty: () => 1,
    player: () => 5,
    luck: () => 5,
    outdoorsman: () => 0,
    perk: () => 0,
    gvars: {},
    car,
  });
  it('paliwo i ruch z hosta; po wyczerpaniu auto stoi w miescie', () => {
    const car = { fuel: 100, moving: true, area: -1 };
    const c = new WorldmapController(data, mkHost(car), { x: 100, y: 100 });
    c.model.setTarget(300, 100);
    const evs = c.step();
    expect(evs.some((e) => e.kind === 'no-fuel')).toBe(true);
    expect(car).toEqual({ fuel: 0, moving: false, area: 0 });
  });
  it('dojazd autem do miasta parkuje je w tym miescie', () => {
    const car = { fuel: 80000, moving: true, area: -1 };
    const c = new WorldmapController(data, mkHost(car), { x: 190, y: 100 });
    c.model.setTargetArea(1);
    for (let i = 0; i < 10 && c.model.target; i++) c.step();
    expect(car).toMatchObject({ moving: false, area: 1 });
  });
});
