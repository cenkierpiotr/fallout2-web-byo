/**
 * Typy regul. `@f2/engine-core` nie istnieje jeszcze na galezi m4, wiec
 * `CritterData` jest tu minimalnym interfejsem strukturalnym (engine-core
 * bedzie go spelniac bez zmian: pola sa podzbiorem rekordu krytera).
 */

export enum Stat {
  Strength = 0,
  Perception = 1,
  Endurance = 2,
  Charisma = 3,
  Intelligence = 4,
  Agility = 5,
  Luck = 6,
  MaxHitPoints = 7,
  MaxActionPoints = 8,
  ArmorClass = 9,
  UnarmedDamage = 10,
  MeleeDamage = 11,
  CarryWeight = 12,
  Sequence = 13,
  HealingRate = 14,
  CriticalChance = 15,
  BetterCriticals = 16,
  DtNormal = 17,
  DtLaser = 18,
  DtFire = 19,
  DtPlasma = 20,
  DtElectrical = 21,
  DtEmp = 22,
  DtExplosion = 23,
  DrNormal = 24,
  DrLaser = 25,
  DrFire = 26,
  DrPlasma = 27,
  DrElectrical = 28,
  DrEmp = 29,
  DrExplosion = 30,
  RadiationResistance = 31,
  PoisonResistance = 32,
  Age = 33,
  Gender = 34,
  CurrentHitPoints = 35,
  CurrentPoison = 36,
  CurrentRadiation = 37,
}

export type Result = { ok: true } | { ok: false; reason: string };

export interface Rng {
  /** Calkowita z przedzialu domknietego [min, max]. */
  int(min: number, max: number): number;
}

export interface GameClockView {
  ticks: number;
}

export interface RulesContext {
  fixes: Record<string, boolean>;
  rng: Rng;
  clock: GameClockView;
  /** Stan walki: krok 3 f2_stat_level (AC z niewykorzystanych AP). */
  combat?: { active: boolean; current: CritterData | null };
  /** Poziom skilla (potrzebny tylko dla HtH Evade: Unarmed = 3). */
  skillLevel?: (c: CritterData, skill: number) => number;
}

/** Podzbior rekordu krytera, ktorego potrzebuja reguly statow. */
export interface CritterData {
  isPlayer: boolean;
  /** Baza statow 0..34; undefined = nie ustawiona jawnie. */
  baseStats: (number | undefined)[];
  /** Bonusy statow 0..34 (np. chemia). */
  bonusStats: (number | undefined)[];
  curHP: number;
  curPoison: number;
  curRad: number;
  /** Dwa sloty traitow, -1 = pusty (tylko gracz). */
  traits: number[];
  /** Ranga perku wg id; brak = 0. */
  perkRanks: Record<number, number>;
  /** Flaga obiektu 0x40 (zaslepienie): PE -5. */
  blinded: boolean;
  /** Suma wag inwentarza (f2_inven_weight). */
  carriedWeight: number;
  /** PID przedmiotow w obu rekach. */
  heldItemPids: number[];
  /** R11a-U1 (Z): f2_item_is_real_weapon != 0 dla ktorejs reki. */
  hasRealWeaponInHand: boolean;
  /** Niewykorzystane AP (obj+0x40), dla AC w walce. */
  apLeft: number;
}
