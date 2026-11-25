/**
 * Reguly skilli, rzutow i doswiadczenia (zrodlo: deasemblacja silnik gry, patrz
 * `dokumentacja techniczna`, sekcja "Badania M3-combat"). Funkcje czyste: losowosc i stany gry
 * wchodza jako argumenty. Tabela skilli to wartosci z sekcji danych exe (0x51d118, krok 44 B).
 */

export const SKILL_COUNT = 18;
export const SKILL_MAX = 300;

export interface SkillDef {
  base: number;
  mult: number;
  stat1: number;
  /** -1 gdy brak drugiej statystyki. */
  stat2: number;
  pointMult: number;
}

/** Statystyki: 0 ST, 1 PE, 2 EN, 3 CH, 4 IN, 5 AG, 6 LK. */
export const SKILLS: readonly SkillDef[] = [
  { base: 5, mult: 4, stat1: 5, stat2: -1, pointMult: 1 }, // 0 small guns
  { base: 0, mult: 2, stat1: 5, stat2: -1, pointMult: 1 }, // 1 big guns
  { base: 0, mult: 2, stat1: 5, stat2: -1, pointMult: 1 }, // 2 energy weapons
  { base: 30, mult: 2, stat1: 5, stat2: 0, pointMult: 1 }, // 3 unarmed
  { base: 20, mult: 2, stat1: 5, stat2: 0, pointMult: 1 }, // 4 melee
  { base: 0, mult: 4, stat1: 5, stat2: -1, pointMult: 1 }, // 5 throwing
  { base: 0, mult: 2, stat1: 1, stat2: 4, pointMult: 1 }, // 6 first aid
  { base: 5, mult: 1, stat1: 1, stat2: 4, pointMult: 1 }, // 7 doctor
  { base: 5, mult: 3, stat1: 5, stat2: -1, pointMult: 1 }, // 8 sneak
  { base: 10, mult: 1, stat1: 1, stat2: 5, pointMult: 1 }, // 9 lockpick
  { base: 0, mult: 3, stat1: 5, stat2: -1, pointMult: 1 }, // 10 steal
  { base: 10, mult: 1, stat1: 1, stat2: 5, pointMult: 1 }, // 11 traps
  { base: 0, mult: 4, stat1: 4, stat2: -1, pointMult: 1 }, // 12 science
  { base: 0, mult: 3, stat1: 4, stat2: -1, pointMult: 1 }, // 13 repair
  { base: 0, mult: 5, stat1: 3, stat2: -1, pointMult: 1 }, // 14 speech
  { base: 0, mult: 4, stat1: 3, stat2: -1, pointMult: 1 }, // 15 barter
  { base: 0, mult: 5, stat1: 6, stat2: -1, pointMult: 1 }, // 16 gambling
  { base: 0, mult: 2, stat1: 2, stat2: 4, pointMult: 1 }, // 17 outdoorsman
];

export interface SkillOptions {
  /** Wydane punkty skilla. */
  points?: number;
  /** Skill oznaczony jako Tag (tylko gracz): punkty liczone podwojnie, +20. */
  tagged?: boolean;
  /** Czwarty tag z perkiem Tag!: bez bonusu +20. */
  tag4Perk?: boolean;
}

/** Wartosc skilla (0x4aa558) bez bonusow cech/perkow/trudnosci. Poza zakresem 0..17: -5. */
export function skillValue(
  skill: number,
  stat: (s: number) => number,
  o: SkillOptions = {},
): number {
  if (!Number.isInteger(skill) || skill < 0 || skill >= SKILL_COUNT) return -5;
  const d = SKILLS[skill]!;
  const points = o.points ?? 0;
  const s = d.stat2 === -1 ? stat(d.stat1) : stat(d.stat1) + stat(d.stat2);
  let v = s * d.mult + d.base + d.pointMult * points;
  if (o.tagged) {
    v += points * d.pointMult;
    if (!o.tag4Perk) v += 20;
  }
  return Math.min(v, SKILL_MAX);
}

/** Dlugosc doby gry w tickach (0xd2f00 = 864000). */
export const TICKS_PER_DAY = 864000;

export type RollDegree = 0 | 1 | 2 | 3;
export interface RollResult {
  /** 0 krytyczna porazka, 1 porazka, 2 sukces, 3 krytyczny sukces. */
  degree: RollDegree;
  /** chance - rzut d100 (pole script+0x4c, opkod how_much). */
  delta: number;
}

/**
 * Stopien rzutu (0x4a3030). Krytyki dzialaja dopiero po uplywie pelnej doby gry. `rand(1,100)`
 * jest wolany dokladnie raz na rzut zasadniczy i raz na rzut krytyka (tylko gdy krytyki aktywne).
 */
export function rollDegree(
  delta: number,
  critChance: number,
  gameTicks: number,
  rand: (min: number, max: number) => number,
): RollDegree {
  const critsOn = Math.floor(gameTicks / TICKS_PER_DAY) >= 1;
  if (delta >= 0) {
    if (!critsOn) return 2;
    return rand(1, 100) <= Math.trunc(delta / 10) + critChance ? 3 : 2;
  }
  if (!critsOn) return 1;
  return rand(1, 100) <= Math.trunc(-delta / 10) ? 0 : 1;
}

/** Rzut d100 pod szanse `chance` (0x4a3000). */
export function rollAgainst(
  chance: number,
  critChance: number,
  gameTicks: number,
  rand: (min: number, max: number) => number,
): RollResult {
  const delta = chance - rand(1, 100);
  return { degree: rollDegree(delta, critChance, gameTicks, rand), delta };
}

/** Przyrost XP gracza (0x4afab8): +5% za kazdy rank Swift Learner, przyciete do 0..2^31-1. */
export function addExperience(current: number, xp: number, swiftLearnerRank: number): number {
  const bonus = Math.trunc((5 * xp * swiftLearnerRank) / 100);
  return Math.min(Math.max(current + xp + bonus, 0), 2147483647);
}

/** Zasieg widzenia (0x42ba04), pojedyncza galaz: percepcja*5 w stozku przodu patrzacego, inaczej percepcja. */
export function sightRange(perception: number, inFront: boolean, targetSneaking: boolean): number {
  if (inFront) {
    const r = perception * 5;
    return targetSneaking ? Math.trunc(r / 2) : r;
  }
  return perception;
}

export interface SightOptions {
  /** Flaga obiektu celu +0x26 bit 0x200 (w stozku zasieg /2). */
  targetFlag200?: boolean;
  /** Bit 0 globalu 0x510944 (stan walki, D: pisarz ustawia bit przy wejsciu w walke): zasieg galezi bez stozka x2. */
  doubled?: boolean;
  /** Cel to gracz (0x6610b8). */
  targetIsPlayer?: boolean;
  /** 0x42e3f4: skradanie gracza + wynik rzutu 0x56d77c (zasieg /4). */
  sneakSuccess?: boolean;
  /** 0x42e2f8(0): bit 0 flag krytera w protoku gracza (skradanie wlaczone, zasieg *2/3). */
  sneaking?: boolean;
  /** Umiejetnosc Sneak celu (0x4aa558, skill 8); > 120 odejmuje 1 od zasiegu /4. */
  sneakSkill?: number;
}

function sneakAdjust(range: number, o: SightOptions): number {
  if (!o.targetIsPlayer) return range;
  if (o.sneakSuccess) {
    const q = Math.trunc(range / 4);
    return (o.sneakSkill ?? 0) > 0x78 ? q - 1 : q;
  }
  return o.sneaking ? Math.trunc((range * 2) / 3) : range;
}

/**
 * Pelny test widzenia 0x42ba04 (D): najpierw galaz stozka (5*P, /2 przy fladze 0x200), potem (rowniez po
 * porazce w stozku) galaz P (x2 przy 0x510944 bit 0); w obu skradanie gracza koryguje zasieg.
 */
export function canSeeInRange(
  distance: number,
  perception: number,
  inFront: boolean,
  o: SightOptions = {},
): boolean {
  if (inFront) {
    const r = perception * 5;
    if (distance <= sneakAdjust(o.targetFlag200 ? Math.trunc(r / 2) : r, o)) return true;
  }
  return distance <= sneakAdjust(o.doubled ? perception * 2 : perception, o);
}

/** Stozek przodu (0x412bec): roznica obrotu patrzacego i kierunku do celu 0, 1 lub 5. */
export function inFrontCone(rotation: number, dirToTarget: number): boolean {
  const d = Math.abs(rotation - dirToTarget);
  return d <= 1 || d === 5;
}

/**
 * Test statystyki (do_check, 0x4afa78): d10 pod suma `stat + mod`; sukces (2) gdy rzut <= suma,
 * inaczej porazka (1). Bez krytykow. delta = suma - rzut (pole script+0x4c, opkod how_much).
 */
export function statCheck(
  statLevel: number,
  mod: number,
  rand: (min: number, max: number) => number,
): RollResult {
  const total = statLevel + mod;
  const roll = rand(1, 10);
  return { degree: roll <= total ? 2 : 1, delta: total - roll };
}
