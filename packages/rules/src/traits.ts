import data from '../data/traits.json' with { type: 'json' };
import type { CritterData, Result } from './types.js';

export enum Trait {
  FastMetabolism = 0,
  Bruiser = 1,
  SmallFrame = 2,
  OneHander = 3,
  Finesse = 4,
  Kamikaze = 5,
  HeavyHanded = 6,
  FastShot = 7,
  BloodyMess = 8,
  Jinxed = 9,
  GoodNatured = 10,
  ChemReliant = 11,
  ChemResistant = 12,
  SexAppeal = 13,
  Skilled = 14,
  Gifted = 15,
}

export interface TraitEffect {
  kind: 'stat' | 'skill' | 'proc';
  target: number;
  delta?: number;
  deltaPerBase?: { stat: number; factor: number };
  cancelBase?: boolean;
  proc?: string;
}
export interface TraitDef {
  index: number;
  key: string;
  msgId: number;
  descMsgId: number;
  effects: TraitEffect[];
  status: string;
}

export const TRAIT_COUNT = 16;
export const TRAIT_DEFS: readonly TraitDef[] = data.traits as TraitDef[];

/**
 * Efekty proceduralne traitow o statusie Z (R11c-U1/U2: Bloody Mess, Jinxed, Sex Appeal):
 * silnik wylacznie sygnalizuje nazwe, wartosc liczbowa jest parametrem warstwy walki/dialogu.
 */
export function traitProcs(c: CritterData): string[] {
  const out: string[] = [];
  for (const t of c.traits) {
    const def = TRAIT_DEFS[t];
    if (!def) continue;
    for (const e of def.effects) if (e.kind === 'proc' && e.proc) out.push(e.proc);
  }
  return out;
}

export function hasTrait(c: CritterData, t: Trait): boolean {
  return c.traits.includes(t);
}

/** Poprawka skilla od traitow (f2_trait_skill_adjust 0x4b40fc): Gifted -10 wszystko, Good Natured. */
export function traitAdjustSkill(c: CritterData, skill: number): number {
  let sum = 0;
  for (const t of c.traits) {
    const def = TRAIT_DEFS[t];
    if (!def) continue;
    for (const e of def.effects) if (e.kind === 'skill' && e.target === skill) sum += e.delta ?? 0;
  }
  return sum;
}

/** Ustawia dwa sloty traitow (null = pusty). Dwa identyczne traity sa odrzucane. */
export function setTraits(c: CritterData, a: Trait | null, b: Trait | null): Result {
  for (const t of [a, b])
    if (t !== null && (!Number.isInteger(t) || t < 0 || t >= TRAIT_COUNT))
      return { ok: false, reason: 'trait-invalid' };
  if (a !== null && a === b) return { ok: false, reason: 'trait-duplicate' };
  c.traits = [a ?? -1, b ?? -1];
  return { ok: true };
}
