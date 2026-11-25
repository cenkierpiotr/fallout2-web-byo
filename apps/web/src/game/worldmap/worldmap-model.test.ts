import { describe, expect, it } from 'vitest';
import type { AreaDef, TileDef, WorldmapConfig } from '@f2/formats';
import { WorldmapModel, type TravelEnv } from './worldmap-model';
import { areaOfMap, mapNameOf, SUB_COLS, type WorldmapData } from './worldmap-data';

const cell = (terrain: string, enc = 'T') => ({
  terrain,
  fill: 'No_Fill' as const,
  morning: 'None',
  afternoon: 'None',
  night: 'None',
  encTable: enc,
});
const tile = (index: number, terrain: string): TileDef => ({
  index,
  artIdx: 339 + index,
  encounterDifficulty: 0,
  cells: Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => cell(terrain))),
});
const area = (i: number, name: string, x: number, y: number, on: 'On' | 'Off'): AreaDef => ({
  index: i,
  name,
  worldPos: { x, y },
  startState: on,
  size: 'Small',
  townmapArtIdx: -1,
  townmapLabelArtIdx: -1,
  entrances: [
    {
      state: 'On',
      x: 0,
      y: 0,
      mapLookupName: `${name} Main`,
      elevation: 0,
      tileNum: 100,
      orientation: 0,
    },
    {
      state: 'Off',
      x: 0,
      y: 0,
      mapLookupName: `${name} Cave`,
      elevation: 0,
      tileNum: 200,
      orientation: 0,
    },
  ],
});
const cfg = {
  data: {
    frequencies: { Forced: 100, Frequent: 65, Common: 55, Uncommon: 50, Rare: 45, None: 0 },
    terrainTypes: { Desert: 1, Mountain: 2 },
  },
  randomMaps: { Desert: [], Mountain: [], City: [], Ocean: [] },
  encounters: new Map(),
  tables: [],
  tiles: Array.from({ length: 20 }, (_, i) => tile(i, i === 1 ? 'Mountain' : 'Desert')),
} as unknown as WorldmapConfig;
const data: WorldmapData = {
  cfg,
  areas: [
    area(0, 'Arroyo', 100, 100, 'On'),
    area(1, 'Klamath', 200, 100, 'On'),
    area(2, 'Den', 300, 100, 'Off'),
  ],
  maps: [
    { index: 0, name: 'ARMAIN', lookup: 'Arroyo Main' },
    { index: 1, name: 'KLMAIN', lookup: 'Klamath Main' },
  ],
};
const env = (over: Partial<TravelEnv> = {}): TravelEnv => ({
  rng: { int: () => 100 },
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

describe('WorldmapModel', () => {
  it('start w Arroyo, znane tylko miasta On, mgla odslonieta wokol gracza', () => {
    const m = new WorldmapModel(data);
    expect([m.x, m.y]).toEqual([100, 100]);
    expect([...m.known].sort()).toEqual([0, 1]);
    expect(m.fogAt(100, 100)).toBe(1);
    expect(m.fogAt(1000, 1000)).toBe(0);
    expect(m.areaVisible(0)).toBe(true);
    expect(m.areaVisible(1)).toBe(false);
  });
  it('ruch pieszy: 1 px na iteracje na pustyni (koszt 1), zegar rosnie o 18000 tikow', () => {
    const m = new WorldmapModel(data);
    m.setTarget(140, 100);
    const r = m.iterate(env());
    expect(r.ticks).toBe(18000);
    expect(m.x).toBe(101);
  });
  it('gory (koszt 2): 3 z 4 krokow licznika; Pathfinder znosi koszt', () => {
    const m = new WorldmapModel(data, { x: 360, y: 10 });
    expect(m.terrainCost(360, 10)).toBe(2);
    m.setTarget(400, 10);
    for (let i = 0; i < 4; i++) m.iterate(env());
    expect(m.x).toBe(363);
    const p = new WorldmapModel(data, { x: 360, y: 10 });
    p.setTarget(400, 10);
    for (let i = 0; i < 4; i++) p.iterate(env({ pathfinder: 1 }));
    expect(p.x).toBe(364);
  });
  it('samochod: 4 kroki na iteracje i spalanie paliwa; bez paliwa jak pieszo', () => {
    const m = new WorldmapModel(data);
    m.car = true;
    m.fuel = 1000;
    m.setTarget(160, 100);
    m.iterate(env());
    expect(m.x).toBe(104);
    expect(m.fuel).toBe(900); // jedna iteracja = 100 (0x4c4da4, D), nie na krok
    m.fuel = 0;
    const r = m.iterate(env());
    expect(r.events).toContainEqual({ kind: 'no-fuel', area: 0 });
    expect(m.x).toBe(104);
    expect(m.car).toBe(false);
    expect(m.target).toBeNull();
  });
  it('spalanie GVAR: 456 -> 10, 455 -> 90, 453 -> 50 na iteracje; dodatkowe kroki 439/455/456', () => {
    const run = (gvars: Record<number, number>) => {
      const m = new WorldmapModel(data);
      m.car = true;
      m.fuel = 1000;
      m.setTarget(160, 100);
      m.iterate(env({ gvars }));
      return m;
    };
    expect(run({ 456: 1 }).fuel).toBe(990);
    expect(run({ 455: 1 }).fuel).toBe(910);
    expect(run({ 453: 1 }).fuel).toBe(950);
    expect(run({ 456: 1 }).x).toBeGreaterThan(run({}).x);
  });
  it('paliwo konczy sie w trakcie jazdy: zatrzymanie samochodu i podrozy', () => {
    const m = new WorldmapModel(data);
    m.car = true;
    m.fuel = 100;
    m.setTarget(160, 100);
    const r = m.iterate(env());
    expect(r.events).toContainEqual({ kind: 'no-fuel', area: 0 });
    expect(m.fuel).toBe(0);
    expect(m.car).toBe(false);
    expect(m.target).toBeNull();
  });
  it('wejscie do miasta: cel miasta konczy sie zdarzeniem city; wejscia i mapy lokalne', () => {
    const m = new WorldmapModel(data, { x: 190, y: 100 });
    expect(m.setTargetArea(1)).toBe(true);
    const evs = [];
    for (let i = 0; i < 20 && m.target; i++) evs.push(...m.iterate(env()).events);
    expect(evs).toContainEqual({ kind: 'city', area: 1 });
    expect(m.entrancesOf(1).map((e) => e.map)).toEqual(['KLMAIN']);
    m.setEntrance(1, 1, true);
    expect(m.entrancesOf(1)).toHaveLength(2);
  });
  it('nieznane miasto nie moze byc celem; markKnown odblokowuje', () => {
    const m = new WorldmapModel(data);
    expect(m.setTargetArea(2)).toBe(false);
    m.markKnown(2);
    expect(m.setTargetArea(2)).toBe(true);
  });
  it('mgla: ruch odslania nowe podkafle; scout powieksza promien', () => {
    const m = new WorldmapModel(data, { x: 510, y: 510 });
    const count = (): number => m.fog.reduce((a, b) => a + b, 0);
    const c0 = count();
    m.reveal(2);
    expect(count()).toBeGreaterThan(c0);
    expect(m.fog[Math.floor(510 / 50) * SUB_COLS + Math.floor(510 / 50) + 2]).toBe(1);
  });
  it('snapshot/restore zachowuje stan', () => {
    const m = new WorldmapModel(data);
    m.setTarget(130, 100);
    m.iterate(env());
    m.markKnown(2);
    m.fuel = 5;
    const s = JSON.parse(JSON.stringify(m.snapshot()));
    const n = new WorldmapModel(data);
    n.restore(s);
    expect([n.x, n.y, n.fuel]).toEqual([m.x, m.y, 5]);
    expect(n.known.has(2)).toBe(true);
    expect(n.fogAt(m.x, m.y)).toBe(1);
  });
  it('mapNameOf / areaOfMap', () => {
    expect(mapNameOf(data.maps, 'arroyo main')).toBe('ARMAIN');
    expect(mapNameOf(data.maps, 1)).toBe('KLMAIN');
    expect(areaOfMap(data, 'KLMAIN')?.name).toBe('Klamath');
    expect(areaOfMap(data, 'nope')).toBeUndefined();
  });
});
