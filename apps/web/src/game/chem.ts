import {
  EventQueue,
  EventQueueEffectPort,
  type TimedEffectData,
  type GameEvent,
} from '@f2/engine-core';
import { DRUG_TABLE, ITEM_PARAMS, PERK_DEFS, createRng } from '@f2/rules';
import type { PlayerSheet, SessionState } from './save-world';

/**
 * Chemia na arkuszu gracza w warstwie web (spojna z `@f2/rules/item-use.takeDrug`, ale na `PlayerSheet`
 * i wspolnej `EventQueue` sesji): efekty natychmiastowe, opoznione etapy (zdarzenia `drug-revert`),
 * przedawkowanie, rzut uzaleznienia i odstawienie. Uklad `proto.data` wg items-pro-layout.json:
 * d[0..2] statId, d[3..5] natychmiast, d[6] czas 1 (min), d[7..9] etap 1, d[10] czas 2, d[11..13] etap 2,
 * d[14] szansa uzaleznienia, d[15] efekt odstawienia, d[16] start odstawienia (min).
 *
 * D: koszt AP uzycia w walce = 2 (AI chem 0x428480; dla gracza Z, patrz dokumentacja techniczna),
 * martwy krytter nie moze uzyc leku (0x42dd18), przedawkowanie maxCount=4 (Buffout/Mentats/Psycho/Jet),
 * uzaleznienie: rzut 1..100 <= szansa (Chem Reliant x2, Chem Resistant /2, Flower Child /2).
 */
export const CHEM_USE_AP = 2; // przestarzale (odchylka): patrz inventoryOpenApCost

/**
 * D (specyfikacja formatu silnik gry, R12b): gracz w walce placi za OTWARCIE ekwipunku (0x46e7b0): 4 AP, 2 z perkiem
 * Quick Pockets (perk 0x30); brak AP = komunikat 0x13. Samo uzycie leku (0x47304c -> 0x49c240 -> 0x479f60)
 * nie odejmuje AP. CHEM_USE_AP = 2 jest odchylka (zostaje, bo importuje go combat-controller, ktorego tu nie
 * edytujemy): wlasciciel walki powinien przejsc na inventoryOpenApCost() i 0 AP za sam lek.
 */
export const INVENTORY_OPEN_AP = 4;
export const INVENTORY_OPEN_AP_QUICK_POCKETS = 2;
export function inventoryOpenApCost(hasQuickPockets: boolean): number {
  return hasQuickPockets ? INVENTORY_OPEN_AP_QUICK_POCKETS : INVENTORY_OPEN_AP;
}
const STAT_MAX_HP = 7;
const STAT_AP = 8;
const STAT_HP = ITEM_PARAMS.hpStat;
const TICKS_PER_MINUTE = ITEM_PARAMS.ticksPerMinute;
/** Odstawienie trwa 10080 min (D), z Chem Reliant 5040, Flower Child polowa (Z: kolejnosc laczenia). */
const WITHDRAWAL = { normal: 10080, reliant: 5040 } as const;

/** Klucze flag w `SessionState.globals` (zapisywane razem ze stanem sesji). */
export const addictionKey = (gvar: number): string => `gvar:${gvar}`;
export const withdrawalKey = (gvar: number): string => `withdrawal:${gvar}`;
/** Znacznik: perk odstawienia nalozony przez chemie (wartosc = indeks perku + 1), by koniec zdjal wlasnie ten. */
export const withdrawalPerkKey = (gvar: number): string => `withdrawalPerk:${gvar}`;

/** Prawdziwe GVAR-y skryptow (D: exe trzyma flage uzaleznienia w tablicy GVAR 0x5186c0, 0x47a640/0x479f60). */
export interface GvarAccess {
  get(i: number): number;
  set(i: number, v: number): void;
}

export type ChemResult =
  | {
      ok: true;
      consumed: true;
      overdose?: boolean;
      addicted?: boolean;
      effects: { stat: number; amount: number }[];
    }
  | { ok: false; consumed: false; reason: 'dead' | 'not-drug' };

export interface ChemEnv {
  sheet: PlayerSheet;
  queue: EventQueue;
  rng: SessionState['rng'];
  globals: SessionState['globals'];
  /** GVAR-y skryptow (flaga uzaleznienia wg D); brak = zapas w `globals` (`gvar:<idx>`). */
  gvars?: GvarAccess;
  /** Biezacy czas gry w tickach. */
  ticks: number;
  /** Dawka radiacji gracza (stat 0x25 -> 0x42d3a4: odpornosc, flaga, komunikat); brak = stat pominiety. */
  radiation?: (delta: number) => void;
}

/** Stat 0x25 = Current Radiation (dispatcher statow 0x23..0x25 -> 0x42d3a4, delta). */
export const STAT_RADIATION = 37;

export function maxHpOf(sheet: PlayerSheet): number {
  return (sheet.baseStats[STAT_MAX_HP] ?? 0) + (sheet.statBonuses[STAT_MAX_HP] ?? 0);
}

export function maxApOf(sheet: PlayerSheet): number {
  return Math.max(5, (sheet.baseStats[STAT_AP] ?? 0) + (sheet.statBonuses[STAT_AP] ?? 0) || 6);
}

/** Zmiana statu: HP jest klampowane do max HP (nie obniza ponad stan), reszta idzie w bonusy. */
export function applyStat(
  sheet: PlayerSheet,
  stat: number,
  amount: number,
  radiation?: (delta: number) => void,
): void {
  if (stat < 0 || amount === 0) return;
  if (stat === STAT_RADIATION) {
    radiation?.(amount);
  } else if (stat === STAT_HP) {
    const max = Math.max(maxHpOf(sheet), sheet.hp);
    sheet.hp = Math.max(0, Math.min(max, sheet.hp + amount));
  } else if (stat < sheet.statBonuses.length) {
    sheet.statBonuses[stat] = (sheet.statBonuses[stat] ?? 0) + amount;
  }
}

function withdrawalMinutes(sheet: PlayerSheet): number {
  let m: number = sheet.traits.includes(ITEM_PARAMS.chemReliantTrait)
    ? WITHDRAWAL.reliant
    : WITHDRAWAL.normal;
  if ((sheet.perks[String(ITEM_PARAMS.flowerChildPerk)] ?? 0) > 0) m = Math.trunc(m / 2);
  return m;
}

function addictionChance(sheet: PlayerSheet, base: number): number {
  let c = base;
  if (sheet.traits.includes(ITEM_PARAMS.chemReliantTrait)) c *= 2;
  if (sheet.traits.includes(ITEM_PARAMS.chemResistantTrait)) c = Math.trunc(c / 2);
  if ((sheet.perks[String(ITEM_PARAMS.flowerChildPerk)] ?? 0) > 0) c = Math.trunc(c / 2);
  return c;
}

export function isAddicted(env: ChemEnv, gvar: number): boolean {
  return env.gvars ? env.gvars.get(gvar) !== 0 : env.globals[addictionKey(gvar)] === 1;
}

function setAddicted(env: ChemEnv, gvar: number, on: boolean): void {
  if (env.gvars) env.gvars.set(gvar, on ? 1 : 0);
  else if (on) env.globals[addictionKey(gvar)] = 1;
  else delete env.globals[addictionKey(gvar)];
}

/**
 * Skutki odstawienia = perk o indeksie `withdrawalEffect` (D: 0x47a290 przekazuje go do perk_add_effect
 * 0x496bfc, koniec do 0x496ce0): efekty statowe perku ida do bonusow arkusza, ranga do `sheet.perks`.
 * Zwraca true gdy nalozono (perk poza zakresem albo juz posiadany = nic).
 */
function addWithdrawalPerk(sheet: PlayerSheet, perk: number): boolean {
  const def = PERK_DEFS[perk];
  if (!def || (sheet.perks[String(perk)] ?? 0) > 0) return false;
  sheet.perks[String(perk)] = 1;
  for (const e of def.effects) {
    if (e.kind === 'stat' && e.target >= 0 && e.target < sheet.statBonuses.length) {
      sheet.statBonuses[e.target] = (sheet.statBonuses[e.target] ?? 0) + e.delta;
    }
  }
  return true;
}

function removeWithdrawalPerk(sheet: PlayerSheet, perk: number): void {
  const def = PERK_DEFS[perk];
  if (!def || (sheet.perks[String(perk)] ?? 0) <= 0) return;
  delete sheet.perks[String(perk)];
  for (const e of def.effects) {
    if (e.kind === 'stat' && e.target >= 0 && e.target < sheet.statBonuses.length) {
      sheet.statBonuses[e.target] = (sheet.statBonuses[e.target] ?? 0) - e.delta;
    }
  }
}

function clearWithdrawalPerks(env: ChemEnv): void {
  for (const k of Object.keys(env.globals)) {
    if (!k.startsWith('withdrawalPerk:')) continue;
    removeWithdrawalPerk(env.sheet, (env.globals[k] ?? 0) - 1);
    delete env.globals[k];
  }
}

/** Czy gracz moze uzyc przedmiotu (martwy = nie, D 0x42dd18). */
export function canUseChem(sheet: PlayerSheet): boolean {
  return sheet.hp >= 1;
}

/**
 * Uzycie leku przez gracza: `data` = `proto.data` przedmiotu, `pid` = pid przedmiotu.
 * Nie usuwa przedmiotu z inwentarza (robi to wolajacy, gdy `consumed`).
 */
export function takeChem(env: ChemEnv, pid: number, data: readonly number[]): ChemResult {
  const { sheet } = env;
  if (!canUseChem(sheet)) return { ok: false, consumed: false, reason: 'dead' };
  const port = new EventQueueEffectPort(env.queue);
  const rng = createRng(env.rng.seed);
  const finish = <T>(r: T): T => {
    env.rng.seed = rng.state() & 0x7fffffff;
    return r;
  };

  // Antidotum: zdejmuje uzaleznienia i odstawienia (D, 0x104)
  if (pid === ITEM_PARAMS.antidotePid) {
    clearWithdrawalPerks(env);
    for (const k of Object.keys(env.globals)) {
      if (k.startsWith('gvar:') || k.startsWith('withdrawal:')) delete env.globals[k];
    }
    for (const d of DRUG_TABLE)
      if (env.gvars && d.addictionIndex >= 0) env.gvars.set(d.addictionIndex, 0);
    port.cancel((e) => e.kind === 'withdrawal' || e.kind === 'withdrawal-end');
    return finish({ ok: true, consumed: true, effects: [] });
  }

  const entry = DRUG_TABLE.find((d) => d.drugPid === pid);
  if (entry && entry.maxCount !== 0) {
    const uses = new Set<number>();
    for (const e of port.pending())
      if (e.drugPid === pid && e.kind === 'drug-stage') uses.add(e.useId);
    // Z: spec mowi "efekt nie jest stosowany"; sztuka jest zuzywana (items.json overdoseConsumesItem)
    if (uses.size >= entry.maxCount)
      return finish({ ok: true, consumed: true, overdose: true, effects: [] });
  }

  const effects: { stat: number; amount: number }[] = [];
  const stats: number[] = [];
  const [rlo, rhi] = ITEM_PARAMS.randomStatRange as [number, number];
  for (let i = 0; i < 3; i++) {
    let stat = data[i] ?? -1;
    if (stat === ITEM_PARAMS.randomStatId) stat = rng.roll(rlo, rhi);
    stats.push(stat);
    const amount = data[3 + i] ?? 0;
    if (stat < 0 || amount === 0) continue;
    applyStat(sheet, stat, amount, env.radiation);
    effects.push({ stat, amount });
  }

  const useId = port.newUseId();
  const halve = sheet.traits.includes(ITEM_PARAMS.chemResistantTrait);
  const stages: [number, number][] = [
    [data[6] ?? 0, 7],
    [data[10] ?? 0, 11],
  ];
  for (const [duration, off] of stages) {
    const deltas: { stat: number; amount: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const amount = data[off + i] ?? 0;
      const stat = stats[i] ?? -1;
      if (stat >= 0 && amount !== 0) deltas.push({ stat, amount });
    }
    if (deltas.length === 0) continue;
    const minutes = halve ? Math.trunc(duration / 2) : duration;
    port.schedule({
      targetId: 0,
      atTick: env.ticks + minutes * TICKS_PER_MINUTE,
      kind: 'drug-stage',
      deltas,
      drugPid: pid,
      useId,
      addictionIndex: -1,
      withdrawalEffect: -1,
    });
  }

  // Rzut uzaleznienia (D): 1..100 <= szansa; flaga tylko gdy jeszcze nie uzalezniony
  let addicted = false;
  if (entry && !isAddicted(env, entry.addictionIndex)) {
    const chance = addictionChance(sheet, data[14] ?? 0);
    const [lo, hi] = ITEM_PARAMS.addictionRollRange as [number, number];
    if (rng.roll(lo, hi) <= chance) {
      setAddicted(env, entry.addictionIndex, true);
      addicted = true;
      port.schedule({
        targetId: 0,
        atTick: env.ticks + (data[16] ?? 0) * TICKS_PER_MINUTE,
        kind: 'withdrawal',
        deltas: [],
        drugPid: pid,
        useId: -1,
        addictionIndex: entry.addictionIndex,
        withdrawalEffect: data[15] ?? -1,
      });
    }
  }
  return finish({ ok: true, consumed: true, addicted, effects });
}

/**
 * Obsluga zdarzen czasowych z kolejki sesji (zamiast `() => 0`): koniec etapu leku nakłada
 * zapisane delty, `withdrawal` zapala flage odstawienia i planuje koniec, `withdrawal-end` ja gasi.
 * Zwraca undefined dla zdarzen obcych (wolajacy obsluzy je dalej).
 */
export function handleChemEvent(env: ChemEnv, e: GameEvent): number | undefined {
  const port = new EventQueueEffectPort(env.queue);
  return port.handle(e, (fx: TimedEffectData) => {
    if (fx.kind === 'drug-stage') {
      for (const d of fx.deltas) applyStat(env.sheet, d.stat, d.amount, env.radiation);
    } else if (fx.kind === 'withdrawal') {
      // D: perk z withdrawalEffect nakladany realnie (efekty statowe), flaga + czas trwania
      env.globals[withdrawalKey(fx.addictionIndex)] = 1;
      if (addWithdrawalPerk(env.sheet, fx.withdrawalEffect)) {
        env.globals[withdrawalPerkKey(fx.addictionIndex)] = fx.withdrawalEffect + 1;
      }
      port.schedule({
        targetId: fx.targetId,
        atTick: fx.atTick + withdrawalMinutes(env.sheet) * TICKS_PER_MINUTE,
        kind: 'withdrawal-end',
        deltas: [],
        drugPid: fx.drugPid,
        useId: -1,
        addictionIndex: fx.addictionIndex,
        withdrawalEffect: fx.withdrawalEffect,
      });
    } else {
      delete env.globals[withdrawalKey(fx.addictionIndex)];
      const applied = env.globals[withdrawalPerkKey(fx.addictionIndex)];
      if (applied) removeWithdrawalPerk(env.sheet, applied - 1);
      delete env.globals[withdrawalPerkKey(fx.addictionIndex)];
    }
    return 0;
  });
}
