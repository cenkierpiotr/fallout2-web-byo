import { newProgressState, type ProgressState } from './levelup.js';
import { newSkillState, skillTag, type SkillState } from './skills.js';
import {
  newCritterData,
  recalcDerived,
  setStatBase,
  statLevel,
  defaultRulesContext,
} from './stats.js';
import { Stat, type CritterData, type Result, type RulesContext } from './types.js';

/** Calkowita pula SPECIAL nowej postaci: 7 x 5 + 5 wolnych (gcd.md, pole 107 = 5). */
export const CHARACTER_SPECIAL_TOTAL = 40;

export interface CharacterOptions {
  name: string;
  age: number;
  gender: 0 | 1;
  /** ST PE EN CH IN AG LK, wartosci zapisane (bez poprawek traitow). */
  baseStats: readonly number[];
  /** Do 3 tagow (4. slot dopiero po perku Tag); -1 = pusty. */
  tags: readonly number[];
  /** Dwa sloty traitow; -1 = pusty. */
  traits: readonly number[];
}

export type Character = CritterData & SkillState & ProgressState & { name: string };

export type CharacterResult = { ok: true; character: Character } | { ok: false; reason: string };

/** Pozostale punkty SPECIAL z puli 40 (premade 0, nowa postac 5). */
export function characterPointsRemaining(baseStats: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += baseStats[i] ?? 0;
  return CHARACTER_SPECIAL_TOTAL - sum;
}

/**
 * Fabryka postaci gracza: SPECIAL, wiek, plec, traity, tagi, przeliczenie pochodnych, HP = maxHP.
 * Skille surowe 0 (wartosc skilla liczona wzorem). Nie wola `levelUp`.
 */
export function createCharacter(
  opts: CharacterOptions,
  ctx: RulesContext = defaultRulesContext(),
): CharacterResult {
  if (opts.baseStats.length < 7) return { ok: false, reason: 'stat-invalid' };
  for (let i = 0; i < 7; i++) {
    const v = opts.baseStats[i]!;
    if (!Number.isInteger(v) || v < 1 || v > 10) return { ok: false, reason: 'stat-out-of-range' };
  }
  if (characterPointsRemaining(opts.baseStats) < 0) return { ok: false, reason: 'points-exceeded' };
  const traits = opts.traits.slice(0, 2);
  while (traits.length < 2) traits.push(-1);
  if (traits[0] !== -1 && traits[0] === traits[1]) return { ok: false, reason: 'trait-duplicate' };
  const tags = opts.tags.filter((t) => t >= 0);
  if (tags.length > 3) return { ok: false, reason: 'tag-limit' };

  const c: Character = {
    ...newCritterData(true),
    ...newSkillState(),
    ...newProgressState(),
    name: opts.name,
  };
  c.traits = traits;
  for (let i = 0; i < 7; i++) c.baseStats[i] = opts.baseStats[i]!;
  const age = setStatBase(c, Stat.Age, opts.age, ctx);
  if (!age.ok) return age;
  const g = setStatBase(c, Stat.Gender, opts.gender, ctx);
  if (!g.ok) return g;
  for (const t of tags) {
    const r: Result = skillTag(c, t);
    if (!r.ok) return r;
  }
  recalcDerived(c, ctx);
  c.curHP = statLevel(c, Stat.MaxHitPoints, ctx);
  return { ok: true, character: c };
}
