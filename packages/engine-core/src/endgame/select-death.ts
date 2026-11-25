import type { DeathSlide } from '@f2/formats';
import type { GvarReader } from './gvar-registry.js';

export const MODOC_GVAR = 491;
export const MODOC_ROW_INDEX = 12;

export interface DeathContext {
  gvars: GvarReader;
  areaKnown: (id: number) => boolean;
  level: number;
  reason: 0 | 1 | 2;
  rng: { int(min: number, max: number): number };
}

/** Wybor narracji smierci (0x440bd0, filtr 0x440cf4). Spec: dokumentacja techniczna */
export function selectDeath(
  rows: readonly DeathSlide[],
  ctx: DeathContext,
): DeathSlide | undefined {
  if (rows.length === 0) return undefined;
  if (ctx.reason === 0 && ctx.gvars.get(MODOC_GVAR) !== 0 && rows[MODOC_ROW_INDEX]) {
    return rows[MODOC_ROW_INDEX];
  }
  const eligible = rows.filter(
    (r) =>
      (r.gvar === -1 || ctx.gvars.get(r.gvar) < r.value) &&
      (r.areaKnown === -1 || ctx.areaKnown(r.areaKnown)) &&
      (r.areaNotKnown === -1 || !ctx.areaKnown(r.areaNotKnown)) &&
      ctx.level >= r.minLevel,
  );
  const total = eligible.reduce((a, r) => a + r.chance, 0);
  const roll = ctx.rng.int(0, total);
  let cum = 0;
  let index = 0;
  for (const r of eligible) {
    cum += r.chance;
    if (cum >= roll) break;
    index++;
  }
  // spec: endgame.md#niewiadome-1 (oryginal: wybor po indeksie ABSOLUTNYM rows[index], nie n-ty kwalifikujacy sie)
  return rows[index];
}
