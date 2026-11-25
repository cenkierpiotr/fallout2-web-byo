import { Stat, type CritterData, type RulesContext } from './types.js';
import { PERK_DEFS, perkAddForce, type Perk } from './perks.js';
import { statLevel } from './stats.js';

export interface StatDelta {
  stat: number;
  amount: number;
}

/** 'withdrawal-end' = koniec odstawienia (typ 0); obsluga: endWithdrawal (withdrawal.ts). */
export type TimedEffectKind = 'drug-stage' | 'withdrawal' | 'withdrawal-end';

/** Zdarzenie czasowe (kolejka zdarzen gry). Wszystkie pola sa liczbami/tekstem: serializuje sie 1:1. */
export interface TimedEffect {
  /** Numer kolejnosci wstawienia (stabilne sortowanie przy rownym atTick). */
  seq: number;
  targetId: number;
  atTick: number;
  kind: TimedEffectKind;
  /** Zmiany statow stosowane w chwili zdarzenia (dla etapow lekow: odwrocenie/skutek opozniony). */
  deltas: StatDelta[];
  /** PID leku (-1 gdy nie dotyczy). */
  drugPid: number;
  /** Identyfikator pojedynczego uzycia leku (do liczenia limitu przedawkowania). */
  useId: number;
  /** Indeks uzaleznienia (-1 gdy nie dotyczy). */
  addictionIndex: number;
  /** Pole withdrawalEffect z proto (Z, R12-U1). */
  withdrawalEffect: number;
}

export type TimedEffectInput = Omit<TimedEffect, 'seq'>;
export type TimedEffectJSON = TimedEffect;

/**
 * Port kolejki efektow czasowych: to jedyne, czego potrzebuje logika lekow (item-use).
 * Implementuja go TimedEffectQueue (samodzielna) i adapter nad EventQueue w engine-core.
 */
export interface TimedEffectPort {
  schedule(e: TimedEffectInput): unknown;
  /** Nowy identyfikator uzycia leku. */
  newUseId(): number;
  pending(): readonly TimedEffect[];
  /** Usuwa zdarzenia spelniajace warunek; zwraca ich liczbe. */
  cancel(pred: (e: TimedEffect) => boolean): number;
}

export class TimedEffectQueue implements TimedEffectPort {
  private items: TimedEffect[] = [];
  private nextSeq = 1;
  private nextUse = 1;

  schedule(e: TimedEffectInput): TimedEffect {
    const full: TimedEffect = {
      ...e,
      deltas: e.deltas.map((d) => ({ ...d })),
      seq: this.nextSeq++,
    };
    this.items.push(full);
    return full;
  }

  /** Nowy identyfikator uzycia leku. */
  newUseId(): number {
    return this.nextUse++;
  }

  /** Zdejmuje z kolejki i zwraca zdarzenia z atTick <= nowTick (kolejnosc: czas, potem wstawienie). */
  due(nowTick: number): TimedEffect[] {
    const out = this.items.filter((e) => e.atTick <= nowTick);
    if (out.length === 0) return out;
    this.items = this.items.filter((e) => e.atTick > nowTick);
    return out.sort((a, b) => a.atTick - b.atTick || a.seq - b.seq);
  }

  pending(): readonly TimedEffect[] {
    return this.items;
  }

  /** Usuwa zdarzenia spelniajace warunek; zwraca ich liczbe. */
  cancel(pred: (e: TimedEffect) => boolean): number {
    const before = this.items.length;
    this.items = this.items.filter((e) => !pred(e));
    return before - this.items.length;
  }

  serialize(): TimedEffectJSON[] {
    return this.items.map((e) => ({ ...e, deltas: e.deltas.map((d) => ({ ...d })) }));
  }

  restore(json: readonly TimedEffectJSON[]): void {
    this.items = json.map((e) => ({ ...e, deltas: e.deltas.map((d) => ({ ...d })) }));
    this.nextSeq = this.items.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
    this.nextUse = this.items.reduce((m, e) => Math.max(m, e.useId), 0) + 1;
  }
}

/** Stosuje zmiany statow do krytera: HP/trucizna/promieniowanie wprost, reszta jako bonusStats. */
export function applyStatDeltas(
  c: CritterData,
  deltas: readonly StatDelta[],
  ctx: RulesContext,
): void {
  for (const { stat, amount } of deltas) {
    if (stat === Stat.CurrentHitPoints) {
      const max = statLevel(c, Stat.MaxHitPoints, ctx);
      c.curHP = Math.max(0, Math.min(max, c.curHP + amount));
    } else if (stat === Stat.CurrentPoison) c.curPoison = Math.max(0, c.curPoison + amount);
    else if (stat === Stat.CurrentRadiation) c.curRad = Math.max(0, c.curRad + amount);
    else if (stat >= 0 && stat < Stat.CurrentHitPoints)
      c.bonusStats[stat] = (c.bonusStats[stat] ?? 0) + amount;
  }
}

/**
 * Stosuje zdarzenie do celu (nic, jesli cel nie istnieje). Odstawienie: nadaje perk z pola
 * `withdrawalEffect` (Z, R12-U1/U2), o ile wskazuje perk skryptowy (np. Buffout Addiction);
 * cofa go antidotum (`takeDrug`) przez `withdrawalPerks`.
 */
export function applyTimedEffect(
  target: { critter?: CritterData; withdrawalPerks?: Record<number, number> } | undefined,
  e: TimedEffect,
  ctx: RulesContext,
): void {
  if (!target?.critter) return;
  applyStatDeltas(target.critter, e.deltas, ctx);
  if (e.kind === 'withdrawal' && PERK_DEFS[e.withdrawalEffect]?.scriptOnly) {
    target.withdrawalPerks ??= {};
    if (target.withdrawalPerks[e.addictionIndex] !== undefined) return;
    if (perkAddForce(target.critter, e.withdrawalEffect as Perk).ok)
      target.withdrawalPerks[e.addictionIndex] = e.withdrawalEffect;
  }
}
