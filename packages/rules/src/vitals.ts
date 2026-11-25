import data from '../data/vitals.json' with { type: 'json' };
import { RollResult, statRoll } from './roll.js';
import { defaultRulesContext, statBase, statBonus, statLevel } from './stats.js';
import { Stat, type CritterData, type RulesContext } from './types.js';

/** Leczenie, trucizna i promieniowanie (dokumentacja techniczna). */

const HEAL = data.healHours;
const POISON = data.poison;
const RAD = data.radiation;

/** Wynik zmiany HP: `dead` gdy HP spadlo ponizej 1 (HP obcinane do 0). */
export function adjustHitPoints(
  c: CritterData,
  delta: number,
  ctx: RulesContext = defaultRulesContext(),
): { dead: boolean } {
  const max = statLevel(c, Stat.MaxHitPoints, ctx);
  let hp = c.curHP + delta;
  if (hp > max) hp = max;
  if (hp < 1) {
    c.curHP = 0;
    return { dead: true };
  }
  c.curHP = hp;
  return { dead: false };
}

/** f2_heal_hours (0x42d9f4): healing rate * 14 / 3 h; zwraca faktyczny przyrost HP. */
export function healCritterHours(
  c: CritterData,
  hours: number,
  ctx: RulesContext = defaultRulesContext(),
): number {
  const max = statLevel(c, Stat.MaxHitPoints, ctx);
  if (c.curHP >= max) return 0;
  const gain = HEAL.perThreeHours * Math.floor(hours / HEAL.divisor);
  const before = c.curHP;
  adjustHitPoints(c, gain, ctx);
  return c.curHP - before;
}

/** Odpoczynek (3 h): healing rate * floor(3 / 3). */
export function restHealAmount(c: CritterData, ctx: RulesContext = defaultRulesContext()): number {
  return (
    statLevel(c, Stat.HealingRate, ctx) * Math.floor(data.restHeal.arg / data.restHeal.divisor)
  );
}

/** Godziny odpoczynku do pelnego HP (Z: zaokraglenie w gore do pelnych 3 h). */
export function restHoursToFullHeal(missingHp: number, healingRate: number): number {
  if (missingHp <= 0) return 0;
  if (healingRate <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil(missingHp / healingRate) * data.restHeal.divisor;
}

export interface PoisonResult {
  applied: boolean;
  /** Opoznienie nastepnego ticku w tickach gry; null = brak. */
  nextTickDelay: number | null;
  message?: number;
}

function poisonDelay(poison: number): number {
  return (POISON.baseDelay - POISON.perPoison * poison) * POISON.ticksPerUnit;
}

/** f2_poison_adjust (0x42d210): tylko gracz; dodatnia dawka pomniejszona o odpornosc. */
export function adjustPoison(
  c: CritterData,
  amount: number,
  ctx: RulesContext = defaultRulesContext(),
): PoisonResult {
  if (!c.isPlayer) return { applied: false, nextTickDelay: null };
  if (amount > 0) {
    const resist = statLevel(c, Stat.PoisonResistance, ctx);
    const net = amount - Math.trunc((amount * resist) / 100);
    if (net <= 0) return { applied: false, nextTickDelay: null };
    c.curPoison += net;
    return {
      applied: true,
      nextTickDelay: poisonDelay(c.curPoison),
      message: POISON.messages.poisoned,
    };
  }
  if (amount < 0) {
    if (c.curPoison <= 0) return { applied: false, nextTickDelay: null };
    c.curPoison = Math.max(0, c.curPoison + amount);
    if (c.curPoison === 0)
      return { applied: true, nextTickDelay: null, message: POISON.messages.cured };
    return {
      applied: true,
      nextTickDelay: poisonDelay(c.curPoison),
      message: POISON.messages.less,
    };
  }
  return { applied: false, nextTickDelay: null };
}

export interface PoisonTickResult {
  applied: boolean;
  dead: boolean;
  interrupt: boolean;
  nextTickDelay: number | null;
}

/** f2_poison_tick (0x42d318): trucizna -2, HP -1; przerywa czynnosc gdy HP <= 5. */
export function poisonTick(
  c: CritterData,
  ctx: RulesContext = defaultRulesContext(),
): PoisonTickResult {
  if (!c.isPlayer) return { applied: false, dead: false, interrupt: false, nextTickDelay: null };
  c.curPoison = Math.max(0, c.curPoison + POISON.tickDelta);
  const { dead } = adjustHitPoints(c, POISON.tickHp, ctx);
  return {
    applied: true,
    dead,
    interrupt: !dead && c.curHP <= POISON.interruptHpAtMost,
    nextTickDelay: c.curPoison > 0 ? poisonDelay(c.curPoison) : null,
  };
}

/** Poziom promieniowania 0..5 wg progow 100/200/400/600/1000. */
export function radiationLevel(rad: number): number {
  let level = 0;
  for (const t of RAD.levelThresholds) if (rad >= t) level++;
  return level;
}

export interface RadiationAdjustResult {
  applied: boolean;
  needsMidnightCheck: boolean;
  messages: number[];
}

/** f2_radiation_adjust (0x42d3a4): dawka pomniejszona o odpornosc, komunikaty (Geiger/duza dawka). */
export function adjustRadiation(
  c: CritterData,
  amount: number,
  ctx: RulesContext = defaultRulesContext(),
  geiger = false,
): RadiationAdjustResult {
  const none = { applied: false, needsMidnightCheck: false, messages: [] as number[] };
  if (!c.isPlayer) return none;
  let net = amount;
  if (amount > 0)
    net = amount - Math.trunc((amount * statLevel(c, Stat.RadiationResistance, ctx)) / 100);
  c.curRad = Math.max(0, c.curRad + net);
  const messages: number[] = [];
  if (net > 0) {
    if (geiger)
      messages.push(net <= RAD.minorMessageMax ? RAD.messages.geigerSmall : RAD.messages.geigerBig);
    else if (net >= RAD.bigMessageMin) messages.push(RAD.messages.big);
  }
  return { applied: true, needsMidnightCheck: net > 0, messages };
}

export interface RadiationSchedule {
  level: number;
  phase: 0;
  delayTicks: number;
}

/**
 * f2_radiation_midnight (0x42d4f4): test Endurance z modyfikatorem poziomu; porazka podnosi poziom o 1.
 * Zdarzenie planowane tylko gdy nowy poziom > poziom zaplanowany (`pendingLevel`).
 */
export function radiationMidnightCheck(
  c: CritterData,
  flag: boolean,
  pendingLevel: number,
  ctx: RulesContext = defaultRulesContext(),
): { schedule?: RadiationSchedule } {
  if (!flag) return {};
  const level = radiationLevel(c.curRad);
  const mod = RAD.enduranceModByLevel[level] ?? 0;
  const roll = statRoll(c, Stat.Endurance, mod, ctx);
  let newLevel = level;
  if (roll.result !== RollResult.Success && roll.result !== RollResult.CriticalSuccess)
    newLevel = level + 1;
  if (newLevel <= pendingLevel || newLevel <= 0) return {};
  const hours = ctx.rng.int(RAD.delayHoursMin, RAD.delayHoursMax);
  return { schedule: { level: newLevel, phase: 0, delayTicks: hours * RAD.ticksPerHour } };
}

export interface RadiationEvent {
  level: number;
  phase: 0 | 1;
}
export interface PendingRadiationEvent extends RadiationEvent {
  atTick: number;
}

function applyRadiationEffect(c: CritterData, level: number, sign: 1 | -1): void {
  const row = RAD.effects[level - 1];
  if (!row) return;
  RAD.effectStats.forEach((stat, i) => {
    const delta = row[i] ?? 0;
    if (delta === 0) return;
    // Stat 35 (Z): traktowany jako bonus MaxHitPoints, bo bonusy sa tylko dla statow 0..34.
    const target = stat === 35 ? Stat.MaxHitPoints : stat;
    c.bonusStats[target] = (c.bonusStats[target] ?? 0) + sign * delta;
  });
}

export interface RadiationEventResult {
  schedule?: { level: number; phase: 1; atTick: number };
  remove: PendingRadiationEvent[];
  messages: number[];
  dead: boolean;
  interrupt: boolean;
}

/**
 * f2_radiation_event (0x42d740): faza 0 usuwa oczekujace zdarzenia (faza 1 cofa efekt), stosuje kary poziomu
 * i planuje faze 1 za 7 dob; faza 1 cofa kary. Smierc gdy surowy SPECIAL spada do 0 lub ponizej.
 */
export function handleRadiationEvent(
  c: CritterData,
  ev: RadiationEvent,
  now: number,
  pending: readonly PendingRadiationEvent[],
): RadiationEventResult {
  const res: RadiationEventResult = { remove: [], messages: [], dead: false, interrupt: false };
  if (ev.phase === 1) {
    applyRadiationEffect(c, ev.level, -1);
    return res;
  }
  for (const p of pending) {
    res.remove.push(p);
    if (p.phase === 1) applyRadiationEffect(c, p.level, -1);
  }
  if (ev.level <= 0) return res;
  applyRadiationEffect(c, ev.level, 1);
  res.schedule = { level: ev.level, phase: 1, atTick: now + RAD.recoveryTicks };
  res.messages.push(RAD.messages.levelBase + ev.level - 1);
  res.interrupt = true;
  // 0x42d6c9: petla po 6 pierwszych wpisach tabeli 0x518358 (St..Ag), Luck nie jest sprawdzany (D).
  for (let s = Stat.Strength; s <= Stat.Agility; s++) {
    if (statBase(c, s) + statBonus(c, s) <= 0) {
      res.dead = true;
      res.messages.push(RAD.messages.death);
      break;
    }
  }
  return res;
}
