import type { GvarSource } from './select-slides.js';

/** Wiersz enddeath.txt (strukturalny; zgodny z DeathSlide z @f2/formats). */
export interface DeathRow {
  gvar: number;
  value: number;
  areaKnown: number;
  areaNotKnown: number;
  minLevel: number;
  chance: number;
  narrator: string;
}

export const MODOC_GVAR = 491;
export const MODOC_ROW_INDEX = 12;

export interface DeathSelectContext {
  gvars: GvarSource;
  isAreaKnown: (id: number) => boolean;
  level: number;
  /** 0 = zwykla smierc, 1 = j.w. bez Modoc, 2 = timeout (film timeout.mve wola wywolujacy). */
  reason: 0 | 1 | 2;
  rng: { int(min: number, max: number): number };
}

/**
 * Wybor narracji smierci (0x440bd0, filtr 0x440cf4). Spec: dokumentacja techniczna
 * Filtr: gvar < value (gdy gvar != -1), areaKnown musi byc znany, areaNotKnown nie moze byc znany,
 * level >= minLevel. Wynik to rows[index] po indeksie ABSOLUTNYM (cecha oryginalu).
 */
export function selectDeathSlide<T extends DeathRow>(
  rows: readonly T[],
  ctx: DeathSelectContext,
): T {
  if (rows.length === 0) throw new Error('enddeath: pusta tabela');
  if (ctx.reason === 0 && ctx.gvars.get(MODOC_GVAR) !== 0 && rows[MODOC_ROW_INDEX]) {
    return rows[MODOC_ROW_INDEX]!;
  }
  const eligible = rows.filter(
    (r) =>
      (r.gvar === -1 || ctx.gvars.get(r.gvar) < r.value) &&
      (r.areaKnown === -1 || ctx.isAreaKnown(r.areaKnown)) &&
      (r.areaNotKnown === -1 || !ctx.isAreaKnown(r.areaNotKnown)) &&
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
  const picked = rows[index];
  if (picked) return picked;
  return rows.find((r) => r.narrator.startsWith('Generic')) ?? rows[0]!;
}
