import { describe, expect, it } from 'vitest';
import { EventQueue } from '@f2/engine-core';
import {
  INVENTORY_OPEN_AP,
  inventoryOpenApCost,
  addictionKey,
  handleChemEvent,
  takeChem,
  withdrawalKey,
  type ChemEnv,
} from './chem';
import { CombatController, type CombatHost } from './combat-controller';
import { defaultSessionState } from './save-world';

const MIN = 600;

/** Uklad proto.data leku: statId[3], natychmiast[3], czas1, etap1[3], czas2, etap2[3], szansa, efekt odst., start odst. */
function drug(o: {
  stat: number[];
  now?: number[];
  t1?: number;
  d1?: number[];
  t2?: number;
  d2?: number[];
  addict?: number;
  wd?: number;
  onset?: number;
}): number[] {
  const p3 = (a: number[] = []): number[] => [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0];
  const st = [o.stat[0] ?? -1, o.stat[1] ?? -1, o.stat[2] ?? -1];
  return [
    ...st,
    ...p3(o.now),
    o.t1 ?? 0,
    ...p3(o.d1),
    o.t2 ?? 0,
    ...p3(o.d2),
    o.addict ?? 0,
    o.wd ?? 0,
    o.onset ?? 0,
  ];
}

function env(): ChemEnv {
  const s = defaultSessionState();
  s.sheet.hp = 20;
  s.sheet.baseStats[7] = 50;
  return { sheet: s.sheet, queue: new EventQueue(), rng: s.rng, globals: s.globals, ticks: 0 };
}

const STIMPAK = drug({ stat: [35], now: [40] });
const BUFFOUT = drug({ stat: [0, 1, 2], now: [2, 2, 3], t1: 60, d1: [-2, -2, -3] });
const PSYCHO = drug({ stat: [8], now: [3], t1: 5, d1: [-3], addict: 100, wd: 56, onset: 10 });
const BUFFOUT_PID = 87;
const PSYCHO_PID = 110;

function expire(e: ChemEnv, ticks: number): void {
  e.ticks = ticks;
  e.queue.processUntil(ticks, (ev) => handleChemEvent(e, ev) ?? 0);
}

describe('takeChem', () => {
  it('stimpak leczy do max HP i nie ponad', () => {
    const e = env();
    expect(takeChem(e, 40, STIMPAK).ok).toBe(true);
    expect(e.sheet.hp).toBe(50);
    takeChem(e, 40, STIMPAK);
    expect(e.sheet.hp).toBe(50);
  });
  it('martwy nie moze uzyc leku (D 0x42dd18)', () => {
    const e = env();
    e.sheet.hp = 0;
    expect(takeChem(e, 40, STIMPAK)).toEqual({ ok: false, consumed: false, reason: 'dead' });
  });
  it('buffout: bonus natychmiast, zdjety po czasie etapu', () => {
    const e = env();
    takeChem(e, BUFFOUT_PID, BUFFOUT);
    expect(e.sheet.statBonuses.slice(0, 3)).toEqual([2, 2, 3]);
    expect(e.queue.peek(() => true).length).toBe(1);
    expire(e, 59 * MIN);
    expect(e.sheet.statBonuses.slice(0, 3)).toEqual([2, 2, 3]);
    expire(e, 60 * MIN);
    expect(e.sheet.statBonuses.slice(0, 3)).toEqual([0, 0, 0]);
  });
  it('przedawkowanie: 5. buffout w kolejce nie daje efektu, ale zuzywa sztuke', () => {
    const e = env();
    for (let i = 0; i < 4; i++) takeChem(e, BUFFOUT_PID, BUFFOUT);
    expect(e.sheet.statBonuses[0]).toBe(8);
    const r = takeChem(e, BUFFOUT_PID, BUFFOUT);
    expect(r).toMatchObject({ ok: true, consumed: true, overdose: true });
    expect(e.sheet.statBonuses[0]).toBe(8);
  });
  it('uzaleznienie: szansa 100 ustawia flage, odstawienie startuje po onset i konczy sie po 10080 min', () => {
    const e = env();
    const r = takeChem(e, PSYCHO_PID, PSYCHO);
    expect(r).toMatchObject({ addicted: true });
    expect(e.globals[addictionKey(24)]).toBe(1);
    expire(e, 10 * MIN);
    expect(e.globals[withdrawalKey(24)]).toBe(1);
    expire(e, (10 + 10080) * MIN);
    expect(e.globals[withdrawalKey(24)]).toBeUndefined();
    expect(e.globals[addictionKey(24)]).toBe(1);
  });
  it('Chem Resistant polowi czas etapu, Chem Reliant podwaja szanse', () => {
    const e = env();
    e.sheet.traits = [12];
    takeChem(e, BUFFOUT_PID, BUFFOUT);
    expire(e, 30 * MIN);
    expect(e.sheet.statBonuses[0]).toBe(0);
    const f = env();
    f.sheet.traits = [11];
    takeChem(f, 53, drug({ stat: [4], now: [1], addict: 50, onset: 1 }));
    expect(f.globals[addictionKey(23)]).toBe(1); // 50*2 = 100%
  });
  it('antidotum (260) zdejmuje uzaleznienia i odstawienie', () => {
    const e = env();
    takeChem(e, PSYCHO_PID, PSYCHO);
    takeChem(e, 260, drug({ stat: [] }));
    expect(e.globals[addictionKey(24)]).toBeUndefined();
    expire(e, 20000 * MIN);
    expect(e.globals[withdrawalKey(24)]).toBeUndefined();
  });
  it('odstawienie naklada perk z withdrawalEffect (IN -2) i zdejmuje go po koncu', () => {
    const e = env();
    takeChem(e, PSYCHO_PID, PSYCHO);
    expire(e, 10 * MIN);
    expect(e.sheet.perks['56']).toBe(1);
    expect(e.sheet.statBonuses[4]).toBe(-2);
    expire(e, (10 + 10080) * MIN);
    expect(e.sheet.perks['56']).toBeUndefined();
    expect(e.sheet.statBonuses[4]).toBe(0);
  });
  it('antidotum w trakcie odstawienia cofa perk i zeruje GVAR', () => {
    const e = env();
    const vars: number[] = [];
    e.gvars = { get: (i) => vars[i] ?? 0, set: (i, v) => void (vars[i] = v) };
    takeChem(e, PSYCHO_PID, PSYCHO);
    expect(vars[24]).toBe(1);
    expect(e.globals[addictionKey(24)]).toBeUndefined();
    expire(e, 10 * MIN);
    expect(e.sheet.statBonuses[4]).toBe(-2);
    takeChem(e, 260, drug({ stat: [] }));
    expect(e.sheet.statBonuses[4]).toBe(0);
    expect(e.sheet.perks['56']).toBeUndefined();
    expect(vars[24]).toBe(0);
  });
  it('uzaleznienie czytane z GVAR: juz uzalezniony nie dostaje drugiego rzutu', () => {
    const e = env();
    const vars: number[] = [];
    vars[24] = 1;
    e.gvars = { get: (i) => vars[i] ?? 0, set: (i, v) => void (vars[i] = v) };
    expect(takeChem(e, PSYCHO_PID, PSYCHO)).not.toMatchObject({ addicted: true });
    expect(e.queue.peek((x) => x.kind === 'withdrawal').length).toBe(0);
  });
  it('zdarzenie obce nie jest obslugiwane (undefined)', () => {
    const e = env();
    expect(
      handleChemEvent(e, { atTick: 0, kind: 'script-timer', objId: 0, payload: null } as never),
    ).toBeUndefined();
  });
});

function critter(hex: number, over: Record<string, unknown> = {}): never {
  const raw = new Array<number>(16).fill(0);
  raw[7] = 12;
  raw[5] = 1;
  return {
    id: 100 + hex,
    pid: 0x1000000,
    type: 1,
    hex,
    elevation: 0,
    flags: 0,
    inventory: [],
    proto: {
      kind: 'critter',
      baseStats: new Array(35).fill(5),
      bonusStats: new Array(35).fill(0),
      skills: [],
      team: 1,
      aiPacket: 0,
    },
    extra: { kind: 'critter', flags: 0, raw },
    hidden: false,
    ...over,
  } as never;
}

describe('chemia w walce (CombatController.chemGate)', () => {
  function setup(): {
    cc: CombatController;
    h: CombatHost & { state: ReturnType<typeof defaultSessionState> };
  } {
    const player = critter(100, { id: 1 });
    const foe = critter(103);
    const state = defaultSessionState();
    state.sheet.hp = 20;
    state.sheet.baseStats[7] = 50;
    const h = {
      world: {
        player,
        map: { objects: [player, foe], byHex: new Map() },
        movement: {
          cancel: () => undefined,
          start: () => ({ ok: true }),
          stateOf: () => undefined,
        },
      } as never,
      state,
      enemiesNearby: () => false,
    } as CombatHost & { state: ReturnType<typeof defaultSessionState> };
    return { cc: CombatController.start(h, { seed: 1 }) as CombatController, h };
  }
  it('otwarcie ekwipunku kosztuje 4 AP (sam lek 0) i leczy gracza w walce', () => {
    const { cc, h } = setup();
    const g = cc.chemGate();
    expect(cc.playerTurn).toBe(true);
    const ap0 = cc.player.ap;
    expect(g.canSpend()).toBe(true);
    const e: ChemEnv = {
      sheet: h.state.sheet,
      queue: h.state.queue,
      rng: h.state.rng,
      globals: h.state.globals,
      ticks: 0,
    };
    takeChem(e, 40, STIMPAK);
    g.spend();
    g.after();
    expect(cc.player.ap).toBe(ap0 - INVENTORY_OPEN_AP);
    expect(cc.player.hp).toBe(50);
    expect(h.state.sheet.hp).toBe(50);
  });
  it('brak AP albo cudza tura = odmowa', () => {
    const { cc } = setup();
    const g = cc.chemGate();
    cc.player.ap = 3;
    expect(g.canSpend()).toBe(false);
    cc.player.ap = 4;
    expect(g.canSpend()).toBe(true);
  });
  it('psycho z bonusem AP podnosi maxAp i biezace AP', () => {
    const { cc, h } = setup();
    const e: ChemEnv = {
      sheet: h.state.sheet,
      queue: h.state.queue,
      rng: h.state.rng,
      globals: h.state.globals,
      ticks: 0,
    };
    const max0 = cc.player.maxAp;
    const ap0 = cc.player.ap;
    const g = cc.chemGate();
    takeChem(e, 999, drug({ stat: [8], now: [3] }));
    g.spend();
    g.after();
    expect(cc.player.maxAp).toBe(max0 + 3);
    expect(cc.player.ap).toBe(ap0 - INVENTORY_OPEN_AP + 3);
  });
  it('Quick Pockets (perk 0x30) obniza koszt otwarcia ekwipunku do 2 AP', () => {
    const { cc, h } = setup();
    h.state.sheet.perks = { '48': 1 };
    const g = cc.chemGate();
    const ap0 = cc.player.ap;
    cc.player.ap = 2;
    expect(g.canSpend()).toBe(true);
    cc.player.ap = ap0;
    g.spend();
    expect(cc.player.ap).toBe(ap0 - 2);
  });
});

describe('koszt AP otwarcia ekwipunku w walce (D, 0x46e7b0)', () => {
  it('4 AP, 2 z Quick Pockets', () => {
    expect(inventoryOpenApCost(false)).toBe(4);
    expect(inventoryOpenApCost(true)).toBe(2);
  });
});

describe('takeChem: radiacja (stat 0x25, D 0x42d3a4)', () => {
  const RADAWAY = drug({ stat: [37], now: [-50], t1: 60, d1: [-50] });
  it('stat 37 idzie do hooka radiacji (natychmiast i etap czasowy), nie do bonusow', () => {
    const e = env();
    const got: number[] = [];
    e.radiation = (d) => void got.push(d);
    expect(takeChem(e, 48, RADAWAY).ok).toBe(true);
    expect(got).toEqual([-50]);
    expire(e, 60 * MIN + 1);
    expect(got).toEqual([-50, -50]);
  });
  it('bez hooka stat 37 jest pomijany (bez bledu)', () => {
    const e = env();
    expect(takeChem(e, 48, RADAWAY).ok).toBe(true);
  });
});
