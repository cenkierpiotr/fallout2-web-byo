import { describe, expect, it } from 'vitest';
import {
  type WmCondition,
  type WmTableEntry,
  checkEncounter,
  evalCondition,
  pickEncounterEntry,
  timeSlot,
  adjustFrequency,
  carChanceReduction,
  evalConditionChain,
  compareOp,
  FREQUENCY_NAMES,
  frequencyIndex,
} from '../src/index.js';

const seq = (...v: number[]) => {
  let i = 0;
  const calls: [number, number][] = [];
  return {
    calls,
    int: (min: number, max: number) => {
      calls.push([min, max]);
      return v[i++] ?? min;
    },
  };
};

describe('worldmap: pora doby, szansa', () => {
  it('sloty', () => {
    expect(timeSlot(600)).toBe(2);
    expect(timeSlot(601)).toBe(0);
    expect(timeSlot(1199)).toBe(0);
    expect(timeSlot(1200)).toBe(1);
    expect(timeSlot(1799)).toBe(1);
    expect(timeSlot(1800)).toBe(2);
    expect(timeSlot(0)).toBe(2);
  });
  it('trudnosc: tryb 2 +1/15, tryb 0 -1/15, tylko dla 0<szansa<100', () => {
    expect(adjustFrequency(60, 2)).toBe(64);
    expect(adjustFrequency(60, 0)).toBe(56);
    expect(adjustFrequency(60, 1)).toBe(60);
    expect(adjustFrequency(100, 2)).toBe(100);
    expect(adjustFrequency(0, 0)).toBe(0);
  });
  it('samochod: -40 / -30 / 0', () => {
    expect([0, 1, 2].map(carChanceReduction)).toEqual([40, 30, 0]);
  });
});

describe('worldmap: warunki wpisu', () => {
  const env = {
    player: (s: string) => (s === 'Level' ? 5 : 0),
    global: (i: number) => (i === 7 ? 1 : 0),
    time: () => 1300,
    numCritters: () => 3,
    rand: (pct: number) => pct >= 50,
  };
  it('porownania i and', () => {
    const c: WmCondition = {
      op: 'and',
      left: {
        op: '>',
        left: { kind: 'player', stat: 'Level' },
        right: { kind: 'const', value: 4 },
      },
      right: { op: '==', left: { kind: 'global', idx: 7 }, right: { kind: 'const', value: 1 } },
    };
    expect(evalCondition(c, env)).toBe(true);
    const d: WmCondition = {
      op: '<',
      left: { kind: 'time' },
      right: { kind: 'const', value: 1200 },
    };
    expect(evalCondition(d, env)).toBe(false);
    expect(evalCondition(undefined, env)).toBe(true);
    expect(evalCondition({ kind: 'rand', pct: 40 }, env)).toBe(false);
  });
});

const E = (chance: number, extra: Partial<WmTableEntry> = {}): WmTableEntry => ({
  chance,
  counter: -1,
  map: -1,
  ...extra,
});

describe('worldmap: wybor wpisu (0x4c0cf4)', () => {
  const base = {
    luck: 5,
    perks: { explorer: 0, ranger: 0, scout: 0 },
    difficulty: 1 as const,
    tableMaps: ['A', 'B'],
    terrainMaps: ['T1', 'T2', 'T3'],
    env: {
      player: () => 0,
      global: () => 0,
      time: () => 0,
      numCritters: () => 0,
      rand: () => true,
    },
  };
  it('wazona selekcja: rzut rand(0,suma) + luck-5; pierwszy wpis z chance > reszta', () => {
    const rng = seq(30, 0); // 30: wpis0 (chance 20) pomijamy -> reszta 10 < 30 -> wpis1
    const r = pickEncounterEntry({ ...base, entries: [E(20), E(50)], rng });
    expect(rng.calls[0]).toEqual([0, 70]);
    expect(r.entryIndex).toBe(1);
  });
  it('granica: rzut == chance przechodzi do nastepnego', () => {
    const rng = seq(20, 0);
    expect(pickEncounterEntry({ ...base, entries: [E(20), E(50)], rng }).entryIndex).toBe(1);
    const rng2 = seq(19, 0);
    expect(pickEncounterEntry({ ...base, entries: [E(20), E(50)], rng: rng2 }).entryIndex).toBe(0);
  });
  it('rzut poza suma wybiera ostatni kwalifikujacy', () => {
    const rng = seq(70, 0);
    expect(pickEncounterEntry({ ...base, entries: [E(20), E(50)], rng }).entryIndex).toBe(1);
  });
  it('luck i perki dodaja do rzutu (Explorer +2, Ranger +1, Scout +1)', () => {
    const rng = seq(10, 0);
    const r = pickEncounterEntry({
      ...base,
      luck: 9,
      perks: { explorer: 1, ranger: 1, scout: 1 },
      entries: [E(20), E(50)],
      rng,
    });
    // 10 + 4 + 4 = 18 < 20
    expect(r.entryIndex).toBe(0);
    const rng2 = seq(16, 0);
    const r2 = pickEncounterEntry({
      ...base,
      luck: 9,
      perks: { explorer: 1, ranger: 1, scout: 1 },
      entries: [E(20), E(50)],
      rng: rng2,
    });
    expect(r2.entryIndex).toBe(1); // 16+8 = 24
  });
  it('trudnosc 0: +5 do rzutu (max suma); 2: -5 (min 0)', () => {
    const e = pickEncounterEntry({
      ...base,
      difficulty: 0,
      entries: [E(20), E(50)],
      rng: seq(16, 0),
    });
    expect(e.entryIndex).toBe(1); // 16+5=21
    const h = pickEncounterEntry({
      ...base,
      difficulty: 2,
      entries: [E(20), E(50)],
      rng: seq(22, 0),
    });
    expect(h.entryIndex).toBe(0); // 22-5=17
    const cap = pickEncounterEntry({
      ...base,
      difficulty: 0,
      entries: [E(20), E(50)],
      rng: seq(69, 0),
    });
    expect(cap.entryIndex).toBe(1);
  });
  it('licznik 0 lub niespelniony warunek wylacza wpis; licznik > 0 jest zmniejszany', () => {
    const rng = seq(5, 0);
    const r = pickEncounterEntry({
      ...base,
      entries: [E(20, { counter: 0 }), E(50, { counter: 3 })],
      rng,
    });
    expect(rng.calls[0]).toEqual([0, 50]);
    expect(r.entryIndex).toBe(1);
    expect(r.newCounter).toBe(2);
    const never: WmCondition = {
      op: '==',
      left: { kind: 'const', value: 1 },
      right: { kind: 'const', value: 2 },
    };
    const r2 = pickEncounterEntry({
      ...base,
      entries: [E(20, { condition: never }), E(50)],
      rng: seq(5, 0),
    });
    expect(r2.entryIndex).toBe(1);
    expect(r2.newCounter).toBe(-1);
  });
  it('mapa: konkretna z wpisu; inaczej losowa z listy tabeli, a bez niej z listy terenu', () => {
    expect(pickEncounterEntry({ ...base, entries: [E(10, { map: 42 })], rng: seq(0) }).map).toBe(
      42,
    );
    const rng = seq(0, 1);
    const r = pickEncounterEntry({ ...base, entries: [E(10)], rng });
    expect(rng.calls[1]).toEqual([0, 1]);
    expect(r.map).toBe('B');
    const rng2 = seq(0, 2);
    const r2 = pickEncounterEntry({ ...base, tableMaps: [], entries: [E(10)], rng: rng2 });
    expect(rng2.calls[1]).toEqual([0, 2]);
    expect(r2.map).toBe('T3');
  });
});

describe('worldmap: test encountera przy podrozy (0x4c0634)', () => {
  const ctx = {
    elapsedTicks: 1500,
    dx: 3,
    dy: 3,
    inCity: false,
    gameTicks: 0,
    specialDone: false,
    hhmm: 700,
    slotFrequencies: [60, 50, 40] as [number, number, number],
    difficulty: 1 as const,
    car: false,
    outdoorsman: 0,
  };
  it('brak testu przy ruchu < 3 w ktorejs osi, czasie < 1500 ticków lub w miescie', () => {
    const rng = seq(1);
    expect(checkEncounter({ ...ctx, dx: 2 }, rng).kind).toBe('none');
    expect(checkEncounter({ ...ctx, dy: -2 }, rng).kind).toBe('none');
    expect(checkEncounter({ ...ctx, elapsedTicks: 1499 }, rng).kind).toBe('none');
    expect(checkEncounter({ ...ctx, inCity: true }, rng).kind).toBe('none');
    expect(rng.calls.length).toBe(0);
  });
  it('rzut: szansa 60 -> rzut 59 trafia, 60 nie', () => {
    expect(checkEncounter(ctx, seq(59, 100)).kind).toBe('encounter');
    expect(checkEncounter(ctx, seq(60, 100)).kind).toBe('none');
  });
  it('wybor slotu wg pory doby', () => {
    expect(checkEncounter({ ...ctx, hhmm: 1300 }, seq(49, 100)).kind).toBe('encounter');
    expect(checkEncounter({ ...ctx, hhmm: 1300 }, seq(50, 100)).kind).toBe('none');
    expect(checkEncounter({ ...ctx, hhmm: 1900 }, seq(39, 100)).kind).toBe('encounter');
    expect(checkEncounter({ ...ctx, hhmm: 1900 }, seq(40, 100)).kind).toBe('none');
  });
  it('trudnosc zmienia szanse (60 -> 64 w trybie 2)', () => {
    expect(checkEncounter({ ...ctx, difficulty: 2 }, seq(63, 100)).kind).toBe('encounter');
    expect(checkEncounter({ ...ctx, difficulty: 2 }, seq(64, 100)).kind).toBe('none');
  });
  it('Outdoorsman: rzut < skill -> pytanie i XP 100-skill; inaczej encounter bez pytania', () => {
    const hit = checkEncounter({ ...ctx, outdoorsman: 70 }, seq(10, 69));
    expect(hit).toEqual({ kind: 'encounter', prompt: true, xp: 30 });
    const miss = checkEncounter({ ...ctx, outdoorsman: 70 }, seq(10, 70));
    expect(miss).toEqual({ kind: 'encounter', prompt: false, xp: 0 });
    const full = checkEncounter({ ...ctx, outdoorsman: 100 }, seq(10, 99));
    expect(full).toEqual({ kind: 'encounter', prompt: true, xp: 0 });
  });
  it('samochod: szansa spada o 40/30/0, a rzut w paśmie obnizenia daje pytanie bez XP', () => {
    // szansa 60, samochod rano -> 20; rzut 30 miesci sie w [20,60): encounter z pytaniem, bez XP
    expect(checkEncounter({ ...ctx, car: true, outdoorsman: 70 }, seq(30, 1))).toEqual({
      kind: 'encounter',
      prompt: true,
      xp: 0,
    });
    // rzut 10 < 20: sprawdzenie Outdoorsman
    expect(checkEncounter({ ...ctx, car: true, outdoorsman: 70 }, seq(10, 5))).toEqual({
      kind: 'encounter',
      prompt: true,
      xp: 30,
    });
  });
  it('wymuszony encounter specjalny po 35 dniach (jednorazowy)', () => {
    const day = 0xd2f00;
    expect(checkEncounter({ ...ctx, gameTicks: 36 * day }, seq(1)).kind).toBe('special');
    expect(checkEncounter({ ...ctx, gameTicks: 35 * day }, seq(100)).kind).toBe('none');
    expect(checkEncounter({ ...ctx, gameTicks: 36 * day, specialDone: true }, seq(100)).kind).toBe(
      'none',
    );
  });
  it('dzien specjalny liczony calkowitoliczbowo (35.5 dnia to jeszcze 35) i bramkowany ruchem', () => {
    const day = 0xd2f00;
    expect(checkEncounter({ ...ctx, gameTicks: 35 * day + day / 2 }, seq(100)).kind).toBe('none');
    expect(checkEncounter({ ...ctx, gameTicks: 36 * day, dx: 2 }, seq(1)).kind).toBe('none');
    expect(checkEncounter({ ...ctx, gameTicks: 36 * day, elapsedTicks: 10 }, seq(1)).kind).toBe(
      'none',
    );
  });
});

describe('worldmap: lancuch warunkow 0x4c1ac8 i flaga Special', () => {
  it('porazka warunku z flaga AND daje false; inaczej liczy sie wynik ostatniego', () => {
    expect(evalConditionChain([])).toBe(true);
    expect(
      evalConditionChain([
        { ok: false, and: true },
        { ok: true, and: false },
      ]),
    ).toBe(false);
    expect(
      evalConditionChain([
        { ok: false, and: false },
        { ok: true, and: false },
      ]),
    ).toBe(true);
    expect(
      evalConditionChain([
        { ok: true, and: false },
        { ok: false, and: false },
      ]),
    ).toBe(false);
    expect(
      evalConditionChain([
        { ok: true, and: true },
        { ok: true, and: true },
      ]),
    ).toBe(true);
  });
  it('operatory porownania 1..4: ==, !=, <, >', () => {
    expect([1, 2, 3, 4].map((op) => compareOp(op, 5, 5))).toEqual([true, false, false, false]);
    expect([1, 2, 3, 4].map((op) => compareOp(op, 3, 5))).toEqual([false, true, true, false]);
    expect([1, 2, 3, 4].map((op) => compareOp(op, 7, 5))).toEqual([false, true, false, true]);
    expect(compareOp(9, 1, 1)).toBe(false);
  });
  it('indeks czestotliwosci wg nazw: none,rare,uncommon,common,frequent,forced', () => {
    expect(FREQUENCY_NAMES).toEqual(['none', 'rare', 'uncommon', 'common', 'frequent', 'forced']);
    expect(frequencyIndex('Frequent')).toBe(4);
    expect(frequencyIndex('nope')).toBe(-1);
  });
  it('pick zwraca flage special wybranego wpisu', () => {
    const r = pickEncounterEntry({
      entries: [{ chance: 10, counter: -1, map: -1, special: true }],
      luck: 5,
      perks: { explorer: 0, ranger: 0, scout: 0 },
      difficulty: 1,
      tableMaps: ['A'],
      terrainMaps: [],
      env: {
        player: () => 0,
        global: () => 0,
        time: () => 0,
        numCritters: () => 0,
        rand: () => true,
      },
      rng: { int: () => 0 } as never,
    });
    expect(r.special).toBe(true);
  });
});
