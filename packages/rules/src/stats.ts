import data from '../data/stats.json' with { type: 'json' };
import { evalExpr } from './expr.js';
import { Stat, type CritterData, type Result, type RulesContext } from './types.js';

interface StatDef {
  index: number;
  key: string;
  msgId: number;
  min: number;
  max: number;
  default: number;
  kind: string;
  derived: { formula: string } | null;
}
interface TraitAdj {
  trait: number;
  stat: number;
  add?: number;
  addPerBase?: { stat: number; factor: number };
  cancelBase?: boolean;
}
interface PerkAdj {
  stat: number;
  perk: number;
  add: number;
  condition?: string;
  elsePerk?: number;
  elseAdd?: number;
}

export const STAT_DEFS: readonly StatDef[] = data.stats as StatDef[];
const TRAIT_ADJ = data.traitAdjust as TraitAdj[];
const PERK_ADJ = data.perkAdjust as PerkAdj[];
const PARAMS = data.params;

export const DERIVED_ORDER: readonly number[] = PARAMS.derivedOrder;
const STAT_COUNT = 38;

export function defaultRulesContext(): RulesContext {
  return {
    fixes: {},
    rng: {
      int(min: number): number {
        return min;
      },
    },
    clock: { ticks: 0 },
  };
}

function def(s: number): StatDef | undefined {
  return STAT_DEFS[s];
}

function clamp(v: number, s: number): number {
  const d = def(s);
  return d ? Math.min(d.max, Math.max(d.min, v)) : v;
}

function isValidStat(s: number): boolean {
  return Number.isInteger(s) && s >= 0 && s < STAT_COUNT;
}

function hasTrait(c: CritterData, t: number): boolean {
  return c.traits.includes(t);
}

function hasPerk(c: CritterData, p: number): boolean {
  return (c.perkRanks[p] ?? 0) > 0;
}

/** Surowa baza zapisana w rekordzie (bez formuly); undefined dla statu bez jawnej bazy i bez wartosci startowej. */
export function statBase(c: CritterData, s: Stat): number {
  if (s === Stat.CurrentHitPoints) return c.curHP;
  if (s === Stat.CurrentPoison) return c.curPoison;
  if (s === Stat.CurrentRadiation) return c.curRad;
  if (!isValidStat(s)) return 0;
  return c.baseStats[s] ?? def(s)?.default ?? 0;
}

export function statBonus(c: CritterData, s: Stat): number {
  if (s >= Stat.CurrentHitPoints || !isValidStat(s)) return 0;
  return c.bonusStats[s] ?? 0;
}

/** Baza efektywna: jawna, a dla niezapisanych pochodnych 7..32 wynik wzoru. */
function effectiveBase(c: CritterData, s: number, ctx: RulesContext): number {
  const explicit = isValidStat(s) && s < 35 ? c.baseStats[s] : undefined;
  if (explicit !== undefined) return explicit;
  const d = def(s);
  if (d?.derived) return computeDerived(c, s, ctx);
  return statBase(c, s);
}

/** Poprawka traitow gracza (f2_trait_adjust_stat); baseOf daje baze statu. */
function traitAdjust(c: CritterData, s: number, baseOf: (st: number) => number): number {
  let sum = 0;
  for (const a of TRAIT_ADJ) {
    if (a.stat !== s || !hasTrait(c, a.trait)) continue;
    if (a.add !== undefined) sum += a.add;
    if (a.addPerBase) sum += a.addPerBase.factor * baseOf(a.addPerBase.stat);
    if (a.cancelBase) sum -= baseOf(s);
  }
  return sum;
}

function perkAdjust(c: CritterData, s: number, ctx: RulesContext): number {
  let sum = 0;
  for (const a of PERK_ADJ) {
    if (a.stat !== s) continue;
    if (a.condition) {
      if (!(c.curHP < Math.trunc(statLevel(c, Stat.MaxHitPoints, ctx) / 2))) continue;
    }
    if (hasPerk(c, a.perk)) sum += a.add;
    else if (a.elsePerk !== undefined && hasPerk(c, a.elsePerk)) sum += a.elseAdd ?? 0;
  }
  if (s === Stat.Charisma && c.heldItemPids.includes(PARAMS.mirroredShadesPid)) sum += 1;
  return sum;
}

function computeDerived(c: CritterData, s: number, ctx: RulesContext): number {
  const d = def(s);
  if (!d?.derived) return statBase(c, s as Stat);
  const lvl = (st: Stat): number => statLevel(c, st, ctx);
  const no = (st: Stat): number => {
    const v = statBase(c, st) + (c.isPlayer ? traitAdjust(c, st, (x) => statBase(c, x)) : 0);
    return PARAMS.noPerksClampPrimaries ? clamp(v, st) : v;
  };
  const getters: Record<string, () => number> = {
    ST: () => lvl(Stat.Strength),
    PE: () => lvl(Stat.Perception),
    EN: () => lvl(Stat.Endurance),
    AG: () => lvl(Stat.Agility),
    LK: () => lvl(Stat.Luck),
    ST0: () => no(Stat.Strength),
    EN0: () => no(Stat.Endurance),
  };
  // Zmienne liczone leniwie: maxHP (ST0/EN0) nie moze wolac statLevel(ST) (cykl przez Adrenaline Rush).
  const vars: Record<string, number> = {};
  for (const [name, get] of Object.entries(getters)) {
    if (new RegExp(`\\b${name}\\b`).test(d.derived.formula)) vars[name] = get();
  }
  return evalExpr(d.derived.formula, vars);
}

/** f2_stat_level (0x4aef48): kolejnosc krokow 1..8 wg specs/stats.md. */
export function statLevel(
  c: CritterData,
  s: Stat,
  ctx: RulesContext = defaultRulesContext(),
): number {
  if (!isValidStat(s)) return 0;
  if (s >= Stat.CurrentHitPoints) return statBase(c, s);
  let v = effectiveBase(c, s, ctx);
  if (c.isPlayer) v += traitAdjust(c, s, (x) => effectiveBase(c, x, ctx));
  v += statBonus(c, s);

  if (s === Stat.ArmorClass && ctx.combat?.active && ctx.combat.current !== c) {
    let mult = 1;
    let bonusUnarmed = 0;
    if (c.isPlayer && hasPerk(c, 93) && !c.hasRealWeaponInHand) {
      mult = 2;
      bonusUnarmed = Math.trunc((ctx.skillLevel?.(c, 3) ?? 0) / 12);
    }
    v += mult * c.apLeft + bonusUnarmed;
  }
  if (s === Stat.Perception && c.blinded) v -= 5;
  if (s === Stat.Age) v += Math.floor(ctx.clock.ticks / PARAMS.ageTicksPerYear);
  if (s === Stat.MaxActionPoints) {
    const d = statLevel(c, Stat.CarryWeight, ctx) - c.carriedWeight;
    if (d < 0) v -= Math.trunc(-d / PARAMS.overloadDivisor) + 1;
  }
  if (c.isPlayer) v += perkAdjust(c, s, ctx);
  return clamp(v, s);
}

/** f2_stat_recalc_derived (0x4af6fc): zapisuje wzory pochodnych do baseStats. */
export function recalcDerived(c: CritterData, ctx: RulesContext = defaultRulesContext()): void {
  // Wszystkie wejscia liczone przed zapisem, jak w oryginale (ST,PE,EN,AG,LK, ST0,EN0).
  const values = DERIVED_ORDER.map((s) => [s, computeDerived(c, s, ctx)] as const);
  for (const [s, v] of values) c.baseStats[s] = v;
}

/** f2_stat_set_base (0x4af4bc). Dla gracza zapisywana jest wartosc bez poprawki traitow. */
export function setStatBase(
  c: CritterData,
  s: Stat,
  value: number,
  ctx: RulesContext = defaultRulesContext(),
): Result {
  if (!isValidStat(s)) return { ok: false, reason: 'stat-invalid' };
  if (s >= Stat.MaxHitPoints && s <= Stat.PoisonResistance)
    return { ok: false, reason: 'stat-derived-readonly' };
  let v = value;
  if (c.isPlayer && s < 35) v -= traitAdjust(c, s, (x) => statBase(c, x));
  const d = def(s) as StatDef;
  if (v < d.min || v > d.max) return { ok: false, reason: 'stat-out-of-range' };
  if (s === Stat.CurrentHitPoints) c.curHP = v;
  else if (s === Stat.CurrentPoison) c.curPoison = v;
  else if (s === Stat.CurrentRadiation) c.curRad = v;
  else c.baseStats[s] = v;
  if (s <= Stat.Luck) recalcDerived(c, ctx);
  return { ok: true };
}

export function newCritterData(isPlayer = false): CritterData {
  const baseStats: (number | undefined)[] = [];
  for (const d of STAT_DEFS)
    if (d.index < 35 && d.kind !== 'derived' && d.kind !== 'resist') baseStats[d.index] = d.default;
  return {
    isPlayer,
    baseStats,
    bonusStats: [],
    curHP: 0,
    curPoison: 0,
    curRad: 0,
    traits: [-1, -1],
    perkRanks: {},
    blinded: false,
    carriedWeight: 0,
    heldItemPids: [],
    hasRealWeaponInHand: false,
    apLeft: 0,
  };
}

/** Poprawka statu od traitow gracza (f2_trait_adjust_stat 0x4b3c7c); uzywana przez statLevel. */
export function traitAdjustStat(
  c: CritterData,
  s: Stat,
  ctx: RulesContext = defaultRulesContext(),
): number {
  return traitAdjust(c, s, (x) => effectiveBase(c, x, ctx));
}
