import data from '../data/skill-use.json' with { type: 'json' };
import vitals from '../data/vitals.json' with { type: 'json' };
import { defaultRulesContext, statLevel } from './stats.js';
import type { CritterData, Rng, RulesContext, Stat } from './types.js';

export enum RollResult {
  CriticalFailure = 0,
  Failure = 1,
  Success = 2,
  CriticalSuccess = 3,
}

export interface RollOutcome {
  result: RollResult;
  /** chance - rzut (ujemny = porazka). */
  margin: number;
}

/**
 * f2_roll_vs_chance (0x4a3000) + f2_roll_crit_check (0x4a3030). Krytyki wylaczone w pierwszej dobie gry
 * (`critsEnabled = false`).
 */
export function rollWithMargin(
  chance: number,
  critMod: number,
  rng: Rng,
  critsEnabled = true,
): RollOutcome {
  const R = data.roll;
  const roll = rng.int(R.dieMin, R.dieMax);
  const margin = chance - roll;
  if (margin < 0) {
    if (critsEnabled && rng.int(R.dieMin, R.dieMax) <= Math.trunc(-margin / R.critDivisor))
      return { result: RollResult.CriticalFailure, margin };
    return { result: RollResult.Failure, margin };
  }
  if (critsEnabled && rng.int(R.dieMin, R.dieMax) <= critMod + Math.trunc(margin / R.critDivisor))
    return { result: RollResult.CriticalSuccess, margin };
  return { result: RollResult.Success, margin };
}

export function rollCheck(
  chance: number,
  critMod: number,
  rng: Rng,
  critsEnabled = true,
): RollResult {
  return rollWithMargin(chance, critMod, rng, critsEnabled).result;
}

export function isSuccess(r: RollResult): boolean {
  return r >= RollResult.Success;
}

/**
 * f2_stat_roll (0x4afa78): k10 <= statLevel + modyfikator = sukces (bez krytykow).
 * Dane: data/vitals.json (`statRoll`).
 */
export function statRoll(
  c: CritterData,
  stat: Stat,
  modifier: number,
  ctx: RulesContext = defaultRulesContext(),
): RollOutcome {
  const chance = statLevel(c, stat, ctx) + modifier;
  const roll = ctx.rng.int(vitals.statRoll.dieMin, vitals.statRoll.dieMax);
  const margin = chance - roll;
  return { result: margin < 0 ? RollResult.Failure : RollResult.Success, margin };
}
