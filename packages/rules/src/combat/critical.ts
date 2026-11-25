import data from '../../data/criticals.json' with { type: 'json' };
import { RollResult } from '../roll.js';

/**
 * Bonus perka Better Criticals do statu 16 (D, perks.md: +20). Do rzutu dodaje sie WARTOSC statu 16
 * atakujacego (0x423eb4), a 16 to tylko jego indeks (criticals.md).
 */
export const CRITICAL_BETTER_CRITICALS_BONUS = 20;

/** Rzut na poziom krytyka (0x423eb4, D): progi 0x15,0x2e,0x47,0x5b,0x65 -> 0..5. */
export function criticalLevel(d100: number, bonus = 0): number {
  const t = d100 + bonus;
  if (t < 0x15) return 0;
  if (t < 0x2e) return 1;
  if (t < 0x47) return 2;
  if (t < 0x5b) return 3;
  if (t < 0x65) return 4;
  return 5;
}

/**
 * Rzut na krytyczne pudlo (0x4240dc, D): t = d100 + (LK-5)*(-5); progi 0x15,0x33,0x4c,0x60 -> 0..4.
 * TODO(criticals.md): tablica efektow 0x517fa0 (stride 0x14) nie jest wyciagnieta (Z).
 */
export function criticalMissLevel(d100: number, luck: number): number {
  const t = d100 + (luck - 5) * -5;
  if (t < 0x15) return 0;
  if (t < 0x33) return 1;
  if (t < 0x4c) return 2;
  if (t < 0x60) return 3;
  return 4;
}

export interface CriticalEntry {
  dmgMult: number;
  flags: number;
  statCheck: number;
  statMod: number;
  failFlags: number;
  msg: number;
  failMsg: number;
}

function toEntry(r: readonly number[] | undefined): CriticalEntry | undefined {
  if (!r) return undefined;
  return {
    dmgMult: r[0]!,
    flags: r[1]!,
    statCheck: r[2]!,
    statMod: r[3]!,
    failFlags: r[4]!,
    msg: r[5]!,
    failMsg: r[6]!,
  };
}

/**
 * Rekord tablicy krytykow. NPC: [killType,czesc,poziom]; gracz: [czesc,poziom] (killType ignorowany).
 * TODO(criticals.md): ktorej tablicy uzywa silnik (cel = gracz) to zalozenie, kolejnosc w 0x423eb4 do potwierdzenia.
 */
export function lookupCritical(
  killType: number,
  part: number,
  level: number,
  forPlayer: boolean,
): CriticalEntry | undefined {
  const key = forPlayer ? `${part},${level}` : `${killType},${part},${level}`;
  const t = (forPlayer ? data.player : data.npc) as Record<string, number[]>;
  return toEntry(t[key]);
}

export interface CriticalOutcome {
  multiplier: number;
  /** Surowe flagi (OR do +0x30 celu); semantyka bitow Z (criticals.md U1). */
  flags: number;
  msgId: number;
  checked: boolean;
  failed: boolean;
}

/**
 * Zastosowanie rekordu (0x423eb4, D): gdy `statCheck != -1` wykonywany jest test statu; wynik <= 1
 * (porazka lub krytyczna porazka) = niezdany -> `failFlags` dodane do flag i komunikat `failMsg`.
 * `statRoll` dostarcza test (0x4afa78); jego formula nie jest w specyfikacji (criticals.md U2).
 * TODO(criticals.md): losowy wybor 1 z 4 flag przy bicie 0x20 w +0x32, flaga 1 dla celu 0x75 oraz
 * zerowanie flag z 0x424088 nie sa zaimplementowane (semantyka Z).
 */
export function resolveCritical(
  e: CriticalEntry,
  statRoll: (stat: number, modifier: number) => RollResult,
): CriticalOutcome {
  if (e.statCheck === -1)
    return { multiplier: e.dmgMult, flags: e.flags, msgId: e.msg, checked: false, failed: false };
  const failed = statRoll(e.statCheck, e.statMod) <= RollResult.Failure;
  return {
    multiplier: e.dmgMult,
    flags: failed ? e.flags | e.failFlags : e.flags,
    msgId: failed ? e.failMsg : e.msg,
    checked: true,
    failed,
  };
}

/**
 * Test statu krytyka 0x4afa78 (D): `d10 <= stat + modyfikator` = sukces (RollResult.Success), inaczej Failure.
 * `rollD10` zwraca 1..10, `statValue` to wartosc statu krytera.
 */
export function criticalStatCheck(
  statValue: number,
  modifier: number,
  rollD10: number,
): RollResult {
  return rollD10 <= statValue + modifier ? RollResult.Success : RollResult.Failure;
}
