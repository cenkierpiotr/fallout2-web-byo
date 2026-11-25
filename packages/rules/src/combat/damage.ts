import { DamageType } from './types.js';

export interface RoundDamageInput {
  /** Rolka obrazen broni dla jednej rundy. */
  roll: number;
  /** Bonus dystansowy (perk 4). D (0x424911): 2 * stopien perka 4, tylko gracz i klasa trybu 4; dodawany do rolki przed mnoznikiem. */
  rangedBonus: number;
  ammoMult: number;
  ammoDiv: number;
  /** Procent trudnosci: 75 / 100 / 125 (patrz `difficultyPercent`). */
  difficulty: number;
  /** DT = stat 0x11 + typ. */
  dt: number;
  /** DR% = stat 0x18 + typ. */
  dr: number;
  /** Korekta DR amunicji. */
  ammoDrMod?: number;
  /** Flaga omijania pancerza 0x800 (nie dziala dla EMP). */
  bypassArmor?: boolean;
  /** Perk broni 0x3c lub tryby 0xc, 0xd, 0x12, 0x13: DT razy 20/100. */
  weaponDtReduced?: boolean;
  /** Cel to gracz z cecha Finesse (4): DR +30. Kandydat DEV (combat.md), na razie wiernie. */
  targetFinesse?: boolean;
  damageType?: DamageType;
}

/**
 * f2_combat_compute_damage (0x4247b8, D), obrazenia jednej rundy. Zwraca 0 gdy <= 0.
 * Kolejnosc zmian DR (omijanie, Finesse, amunicja) to Z; przyciecie 0..100 po wszystkich.
 */
export function computeRoundDamage(i: RoundDamageInput): number {
  const div = i.ammoDiv === 0 ? 1 : i.ammoDiv;
  let d = Math.trunc(((i.roll + i.rangedBonus) * i.ammoMult) / div);
  d = Math.trunc(d / 2);
  d = Math.trunc((d * i.difficulty) / 100);
  let dt = i.dt;
  let dr = i.dr;
  if (i.bypassArmor && i.damageType !== DamageType.Emp) {
    dt = Math.trunc((dt * 20) / 100);
    dr = Math.trunc((dr * 20) / 100);
  }
  if (i.weaponDtReduced) dt = Math.trunc((dt * 20) / 100);
  if (i.targetFinesse) dr += 30;
  dr += i.ammoDrMod ?? 0;
  dr = Math.max(0, Math.min(100, dr));
  d -= dt;
  if (d > 0) d -= Math.trunc((d * dr) / 100);
  return d > 0 ? d : 0;
}

export type Difficulty = 'easy' | 'normal' | 'hard';

/** 75 latwy / 125 trudny, tylko gdy atakujacy to NPC (D). */
export function difficultyPercent(attackerIsPlayer: boolean, level: Difficulty): number {
  if (attackerIsPlayer) return 100;
  return level === 'easy' ? 75 : level === 'hard' ? 125 : 100;
}

export interface TotalDamageOptions {
  attackerIsPlayer?: boolean;
  /** Perk 0x61 (Living Anatomy): +5, nie dla killtype 10 i 0x10. */
  livingAnatomy?: boolean;
  /** Perk 0x65 (Pyromaniac): +5 gdy typ obrazen == 2 (ogien). */
  pyromaniac?: boolean;
  killType?: number;
  damageType?: DamageType;
}

/** Suma rund + bonusy gracza po petli (D). */
export function totalDamage(rounds: readonly number[], o: TotalDamageOptions): number {
  let t = 0;
  for (const d of rounds) if (d > 0) t += d;
  if (o.attackerIsPlayer) {
    if (o.livingAnatomy && o.killType !== 10 && o.killType !== 0x10) t += 5;
    if (o.pyromaniac && o.damageType === DamageType.Fire) t += 5;
  }
  return t;
}

/** Odrzut: dmg/10, z perkiem broni 0x3d dmg/5 (D). */
export function knockbackDamage(dmg: number, weaponPerk3d: boolean): number {
  return Math.trunc(dmg / (weaponPerk3d ? 5 : 10));
}

/** HP nigdy < 0; `died` tylko przy przejsciu z > 0 na <= 0 (martwy nie ginie ponownie, XP raz). */
export function applyDamage(hp: number, amount: number): { hp: number; died: boolean } {
  const nh = Math.max(0, hp - Math.max(0, amount));
  return { hp: nh, died: hp > 0 && nh <= 0 };
}

/**
 * Bonus Ranged Damage (perk 4, 0x42492b, D): atakujacy gracz i klasa ataku 4 (dystans, nie rzut):
 * bonus = ranga * 2, dodawany do rzutu obrazen (0x478448) PRZED mnoznikami (roll+bonus)*mnoznik.
 */
export function rangedBonusDamage(
  rank: number,
  attackerIsPlayer: boolean,
  attackClass: number,
): number {
  return attackerIsPlayer && attackClass === 4 ? rank * 2 : 0;
}

/**
 * Stonewall (perk 104, 0x424b37, D): tylko gdy CELEM jest gracz z perkiem. rand(0,99) < 50 anuluje
 * odrzut calkowicie (0), inaczej odrzut jest dzielony przez 2 (calkowite). Bez perka lub gdy cel
 * to nie gracz: bez zmian i bez losowania.
 */
export function stonewallKnockback(
  knockback: number,
  targetIsPlayer: boolean,
  rank: number,
  randomPercent: () => number,
): number {
  if (!targetIsPlayer || rank <= 0) return knockback;
  if (randomPercent() < 50) return 0;
  return Math.trunc(knockback / 2);
}
