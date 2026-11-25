// Test encountera (0x4c0634) i wybor wpisu (0x4c0cf4, 0x4c1ac8).
// D: kolejnosc bramek, dzien specjalny floor>35. Z: zakres rng (przyjeto 1..100 dla rzutu testu), skill party-best (Outdoorsman),
// semantyka typow warunkow 1/4 w 0x4c1ac8, wymuszona scena po 35 dniach.
import type { Rng } from '../types.js';

export const TICKS_PER_DAY = 0xd2f00;

export type WmValue =
  | { kind: 'const'; value: number }
  | { kind: 'player'; stat: string }
  | { kind: 'global'; idx: number }
  | { kind: 'time' }
  | { kind: 'critters' }
  | { kind: 'rand'; pct: number };
export type WmCondition =
  | WmValue
  | {
      op: 'and' | 'or' | '<' | '>' | '==' | '!=' | '<=' | '>=';
      left: WmCondition;
      right: WmCondition;
    };

export interface WmEnv {
  player(stat: string): number;
  global(idx: number): number;
  time(): number;
  numCritters(): number;
  rand(pct: number): boolean;
}

export interface WmTableEntry {
  chance: number;
  /** -1 bez limitu, 0 wylaczony, >0 pozostale uzycia */
  counter: number;
  /** -1 brak konkretnej mapy */
  map: number | string;
  condition?: WmCondition;
  /** Flaga bit 0 rekordu wpisu (0x4c0634: scena specjalna). */
  special?: boolean;
}

/** Nazwy czestotliwosci w kolejnosci tablicy 0x51dd98 (D); wartosci % z sekcji [Data] worldmap.txt. */
export const FREQUENCY_NAMES = [
  'none',
  'rare',
  'uncommon',
  'common',
  'frequent',
  'forced',
] as const;

export function frequencyIndex(name: string): number {
  return FREQUENCY_NAMES.indexOf(name.toLowerCase() as (typeof FREQUENCY_NAMES)[number]);
}

/** Porownanie 0x4c1c0c: 1 ==, 2 !=, 3 <, 4 >; inny kod daje false. */
export function compareOp(op: number, left: number, right: number): boolean {
  switch (op) {
    case 1:
      return left === right;
    case 2:
      return left !== right;
    case 3:
      return left < right;
    case 4:
      return left > right;
    default:
      return false;
  }
}

/**
 * Lancuch warunkow 0x4c1ac8 (D): wynik resetowany do 1 w kazdej iteracji; porazka warunku z flaga
 * AND (rekord +0x34 == 1) konczy z false; inaczej wynikiem jest ostatni warunek. Pusta lista = true.
 */
export function evalConditionChain(items: readonly { ok: boolean; and: boolean }[]): boolean {
  let r = true;
  for (const it of items) {
    r = it.ok;
    if (!r && it.and) return false;
  }
  return r;
}

function num(c: WmCondition, env: WmEnv): number {
  if ('op' in c) {
    const l = num(c.left, env);
    const r = num(c.right, env);
    switch (c.op) {
      case 'and':
        return l !== 0 && r !== 0 ? 1 : 0;
      case 'or':
        return l !== 0 || r !== 0 ? 1 : 0;
      case '<':
        return l < r ? 1 : 0;
      case '>':
        return l > r ? 1 : 0;
      case '==':
        return l === r ? 1 : 0;
      case '!=':
        return l !== r ? 1 : 0;
      case '<=':
        return l <= r ? 1 : 0;
      case '>=':
        return l >= r ? 1 : 0;
    }
  }
  switch (c.kind) {
    case 'const':
      return c.value;
    case 'player':
      return env.player(c.stat);
    case 'global':
      return env.global(c.idx);
    case 'time':
      return env.time();
    case 'critters':
      return env.numCritters();
    case 'rand':
      return env.rand(c.pct) ? 1 : 0;
  }
}

export function evalCondition(c: WmCondition | undefined, env: WmEnv): boolean {
  return c === undefined ? true : num(c, env) !== 0;
}

/** Slot pory doby: 601..1199 -> 0, 1200..1799 -> 1, reszta -> 2. */
export function timeSlot(hhmm: number): 0 | 1 | 2 {
  if (hhmm > 600 && hhmm < 1200) return 0;
  if (hhmm >= 1200 && hhmm < 1800) return 1;
  return 2;
}

/** Trudnosc gry: tryb 2 (+1/15), tryb 0 (-1/15), tylko dla 0 < szansa < 100. */
export function adjustFrequency(chance: number, difficulty: 0 | 1 | 2): number {
  if (chance <= 0 || chance >= 100) return chance;
  const d = Math.trunc(chance / 15);
  if (difficulty === 2) return chance + d;
  if (difficulty === 0) return chance - d;
  return chance;
}

export function carChanceReduction(slot: number): number {
  return [40, 30, 0][slot] ?? 0;
}

export interface EncounterCtx {
  elapsedTicks: number;
  dx: number;
  dy: number;
  inCity: boolean;
  gameTicks: number;
  specialDone: boolean;
  hhmm: number;
  slotFrequencies: [number, number, number];
  difficulty: 0 | 1 | 2;
  car: boolean;
  outdoorsman: number;
}

export type EncounterResult =
  { kind: 'none' } | { kind: 'special' } | { kind: 'encounter'; prompt: boolean; xp: number };

export function checkEncounter(ctx: EncounterCtx, rng: Rng): EncounterResult {
  if (Math.abs(ctx.dx) < 3 || Math.abs(ctx.dy) < 3) return { kind: 'none' };
  if (ctx.elapsedTicks < 1500 || ctx.inCity) return { kind: 'none' };
  if (!ctx.specialDone && Math.floor(ctx.gameTicks / TICKS_PER_DAY) > 35)
    return { kind: 'special' };
  const slot = timeSlot(ctx.hhmm);
  const chance = adjustFrequency(ctx.slotFrequencies[slot], ctx.difficulty);
  const reduced = ctx.car ? Math.max(0, chance - carChanceReduction(slot)) : chance;
  const roll = rng.int(1, 100);
  if (roll >= chance) return { kind: 'none' };
  if (roll >= reduced) return { kind: 'encounter', prompt: true, xp: 0 };
  const detect = rng.int(1, 100);
  if (detect < ctx.outdoorsman)
    return { kind: 'encounter', prompt: true, xp: 100 - ctx.outdoorsman };
  return { kind: 'encounter', prompt: false, xp: 0 };
}

export interface PickInput {
  entries: readonly WmTableEntry[];
  luck: number;
  perks: { explorer: number; ranger: number; scout: number };
  difficulty: 0 | 1 | 2;
  tableMaps: readonly string[];
  terrainMaps: readonly string[];
  env: WmEnv;
  rng: Rng;
}
export interface PickResult {
  entryIndex: number;
  newCounter: number;
  map: string | number | undefined;
  special: boolean;
}

export function pickEncounterEntry(p: PickInput): PickResult {
  const q = p.entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.counter !== 0 && evalCondition(e.condition, p.env));
  if (q.length === 0) return { entryIndex: -1, newCounter: -1, map: undefined, special: false };
  const total = q.reduce((s, { e }) => s + e.chance, 0);
  let roll =
    p.rng.int(0, total) +
    (p.luck - 5) +
    2 * (p.perks.explorer ? 1 : 0) +
    (p.perks.ranger ? 1 : 0) +
    (p.perks.scout ? 1 : 0);
  if (p.difficulty === 0) roll = Math.min(roll + 5, total);
  else if (p.difficulty === 2) roll = Math.max(roll - 5, 0);
  let k = 0;
  for (; k < q.length; k++) {
    if (roll < q[k]!.e.chance) break;
    roll -= q[k]!.e.chance;
  }
  if (k >= q.length) k = q.length - 1;
  const { e, i } = q[k]!;
  const newCounter = e.counter > 0 ? e.counter - 1 : e.counter;
  let map: string | number | undefined;
  if (e.map !== -1 && e.map !== '') map = e.map;
  else if (p.tableMaps.length > 0) map = p.tableMaps[p.rng.int(0, p.tableMaps.length - 1)];
  else if (p.terrainMaps.length > 0) map = p.terrainMaps[p.rng.int(0, p.terrainMaps.length - 1)];
  return { entryIndex: i, newCounter, map, special: e.special === true };
}
