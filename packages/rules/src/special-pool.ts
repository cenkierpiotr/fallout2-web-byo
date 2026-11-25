import { setStatBase, statBase, traitAdjustStat } from './stats.js';
import { Stat, type CritterData, type Result, type RulesContext } from './types.js';
import { defaultRulesContext } from './stats.js';

/**
 * Pula nierozdysponowanych punktow SPECIAL (GCD slowo 107, globalna 0x518538; nowa postac 5, premade 0).
 * To NIE sa punkty skilli (R11b-U2).
 */
export interface SpecialPool {
  points: number;
}

/** Nowa postac dostaje 5 punktow (0x43c20c); wartosc z pliku GCD to `unspentSpecialPoints`. */
export const NEW_CHARACTER_SPECIAL_POINTS = 5;

function step(
  c: CritterData,
  pool: SpecialPool,
  stat: Stat,
  delta: 1 | -1,
  ctx: RulesContext,
): Result {
  if (stat < Stat.Strength || stat > Stat.Luck) return { ok: false, reason: 'not-special' };
  // setStatBase odejmuje poprawke traitow od podanej wartosci, wiec dodajemy ja z powrotem.
  const target = statBase(c, stat) + delta + traitAdjustStat(c, stat, ctx);
  const r = setStatBase(c, stat, target, ctx);
  if (r.ok) pool.points -= delta;
  return r;
}

/**
 * Edytor postaci: podniesienie statystyki (limit 10 przez stat_inc 0x4af5d4) zmniejsza pule (0x437abd).
 *
 * TODO(R11b-U2): spec nie mowi, czy edytor blokuje podniesienie przy pustej puli (0x437abd);
 * tu nie blokujemy, wywolujacy (UI) sprawdza `pool.points > 0`.
 */
export function specialPoolInc(
  c: CritterData,
  pool: SpecialPool,
  stat: Stat,
  ctx: RulesContext = defaultRulesContext(),
): Result {
  return step(c, pool, stat, 1, ctx);
}

/** Obnizenie statystyki (minimum z zakresu statu) zwieksza pule (0x437b45). */
export function specialPoolDec(
  c: CritterData,
  pool: SpecialPool,
  stat: Stat,
  ctx: RulesContext = defaultRulesContext(),
): Result {
  return step(c, pool, stat, -1, ctx);
}
