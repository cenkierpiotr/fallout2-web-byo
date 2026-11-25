import { BodyPart } from './types.js';

/** Tablica int32 pod 0x510954, indeks = czesc ciala 0..9 (D). */
export const BODY_PART_TO_HIT: readonly number[] = [-40, -30, -30, 0, -20, -20, -60, -30, 0, 4];
export const TO_HIT_MAX = 95;
/** Dolna granica poprawnego wyniku 0x4243a8 (D): ponizej -100 oryginal zglasza blad. */
export const TO_HIT_MIN = -100;

/** Wartosc dla HUD: szansa nie jest pokazywana ponizej 0% (obliczona wartosc moze byc ujemna). */
export function displayToHit(v: number): number {
  return Math.max(0, v);
}

export interface ToHitFinishInput {
  /** Skill broni po uwzglednieniu dystansu i bonusow broni/perkow. TODO(combat.md U1): formula dystansu (Z). */
  skillAfterDistance: number;
  part: BodyPart;
  /** Bron nie-dystansowa (podtyp 1/2): kara czesci ciala liczona w polowie, dzielenie ku zeru (krok 9, D). */
  halfPart?: boolean;
  /** Cel lezy: +40 (D). */
  targetProne?: boolean;
  /** Atakujacy ma uszkodzone oczy: -25 (D). */
  attackerEyesCrippled?: boolean;
  /** Kara swiatla dla gracza (wartosc ujemna lub 0). TODO(combat.md U1): wartosci (Z). */
  lightPenalty?: number;
  /** Krok 12 (D, rekord 0x51094c +0xc): bonus ze skryptu `attack`; dodawany po swietle. */
  recordBonus?: number;
  /** Flaga +15 (D: wartosc; zrodlo flagi Z). */
  flag15?: boolean;
  /** Trudnosc NPC: -20 lub +20 (D: wartosci; kiedy ktora Z). */
  difficultyMod?: number;
  /**
   * Opcjonalny hook (sfall hs_tohit): dostaje wynik po przycieciu, zwraca nowa wartosc albo
   * undefined (bez zmiany). Podawany przez silnik tylko gdy sfall wlaczony.
   */
  onToHit?: (computed: number) => number | undefined;
}

/**
 * Koncowka f2_combat_determine_to_hit (0x4243a8), kolejnosc D: baza -> czesc ciala -> swiatlo ->
 * oczy -25 -> lezacy +40 -> flaga +15 -> trudnosc -> przyciecie do 95.
 * Dolna granica (D, 0x424791..0x4247a5): brak przyciecia do 0; wynik < -100 to blad fatalny w oryginale (tu przyciecie do -100).
 * Ujemna szansa trafia do roll_check bez zmian (wieksza szansa krytycznego pudla), `displayToHit` = max(0, v).
 */
export function finishToHit(i: ToHitFinishInput): number {
  const partMod = BODY_PART_TO_HIT[i.part] ?? 0;
  let c = i.skillAfterDistance + (i.halfPart ? Math.trunc(partMod / 2) : partMod);
  c += i.lightPenalty ?? 0;
  c += i.recordBonus ?? 0;
  if (i.attackerEyesCrippled) c -= 25;
  if (i.targetProne) c += 40;
  if (i.flag15) c += 15;
  c += i.difficultyMod ?? 0;
  const clamped = Math.max(TO_HIT_MIN, Math.min(TO_HIT_MAX, c));
  const hooked = i.onToHit?.(clamped);
  return hooked === undefined
    ? clamped
    : Math.max(TO_HIT_MIN, Math.min(TO_HIT_MAX, Math.trunc(hooked)));
}

export interface DistanceInput {
  /** Odleglosc heksowa (0 bez celu). */
  dist: number;
  /** Percepcja (stat 1) atakujacego. */
  perception: number;
  isPlayer: boolean;
  /** Perk broni `proto+0x50`: 0x3a Long Range (x4), 0x40 Scope Range (x5, minDist 8), inaczej x2. */
  weaponPerk?: number;
  eyesCrippled?: boolean;
  /** Poziom perka 0xe Sharpshooter (gracz). */
  sharpshooter?: number;
  useDistance: boolean;
}

/** Modyfikator skilla z dystansu, combat.md krok 3 (D, 0x4243a8). Zwraca 0 gdy nie ma byc dodany. */
export function distanceModifier(i: DistanceInput): number {
  let mult = 2;
  let minDist = 0;
  if (i.weaponPerk === 0x3a) mult = 4;
  else if (i.weaponPerk === 0x40) {
    mult = 5;
    minDist = 8;
  }
  const pe = i.perception;
  let d = i.dist;
  if (d < minDist) d += minDist;
  else d -= i.isPlayer ? (pe - 2) * mult : mult * pe;
  d = Math.max(d, -2 * pe);
  if (i.isPlayer) d -= 2 * (i.sharpshooter ?? 0);
  const r = d >= 0 && i.eyesCrippled ? -12 * d : -4 * d;
  return i.useDistance || r > 0 ? r : 0;
}

/** Kara swiatla celu dla gracza (krok 11, D): progi 0x6666/0x9999/0xcccc. */
export function lightToHitPenalty(light: number): number {
  if (light <= 0x6666) return -40;
  if (light <= 0x9999) return -25;
  if (light <= 0xcccc) return -10;
  return 0;
}

export interface DetermineToHitInput {
  /** Poziom skilla broni (krok 1; baza 0 dla trybow 6, 7, >=0x14 zostaje po stronie wywolujacego). */
  skill: number;
  part: BodyPart;
  /** Podtyp ataku 3 (rzut) lub 4 (dystansowa): dystans, oslona i pelna kara czesci ciala. */
  ranged: boolean;
  /** Dane do kroku 3 (dystans); brak = bez modyfikatora. */
  distance?: Omit<DistanceInput, 'useDistance'>;
  /** Flaga useDistance (domyslnie true). */
  useDistance?: boolean;
  /** Zywe krytery na linii strzalu z multihexem liczonym podwojnie (krok 4, 0x426cc4). */
  coverCount?: number;
  isPlayer?: boolean;
  /** Cecha 3 (One Hander) gracza, tryby 0..3; twoHanded = `proto+0x18 & 0x200` (krok 5). */
  oneHander?: boolean;
  twoHanded?: boolean;
  /** Min ST broni (`proto+0x40`) i ST atakujacego; Weapon Handling (perk 0x6a) gracza: -3 (krok 6). */
  minSt?: number;
  st?: number;
  weaponHandling?: boolean;
  /** Perk broni 0x3b (Accurate): +20 (krok 7). */
  accurate?: boolean;
  /** AC celu (stat 9) i korekta AC amunicji (`ammo proto+0x2c`); suma nie spada ponizej 0 (krok 8). */
  targetAc?: number;
  ammoAcMod?: number;
  targetMultihex?: boolean;
  targetProne?: boolean;
  attackerEyesCrippled?: boolean;
  lightPenalty?: number;
  /** Krok 12: rekord 0x51094c +0xc (D). */
  recordBonus?: number;
  difficultyMod?: number;
  onToHit?: ToHitFinishInput['onToHit'];
}

/**
 * Pelna formula f2_combat_determine_to_hit 0x4243a8 (kroki 1..15 z dokumentacja techniczna, D).
 * Krok 12 (rekord 0x51094c +0xc) = `recordBonus` (D). Osloniecie: countCover w line.ts (D). Dolna granica 0 to zalozenie (oryginal: < -100 = blad).
 */
export function determineToHit(i: DetermineToHitInput): number {
  let skill = i.skill;
  const useDistance = i.useDistance ?? true;
  if (i.ranged) {
    if (i.distance) skill += distanceModifier({ ...i.distance, useDistance });
    if (useDistance) skill -= 10 * (i.coverCount ?? 0);
  }
  if (i.isPlayer && i.oneHander) skill += i.twoHanded ? -40 : 20;
  let need = (i.minSt ?? 0) - (i.st ?? 0);
  if (i.isPlayer && i.weaponHandling) need -= 3;
  if (need > 0) skill -= 20 * need;
  if (i.accurate) skill += 20;
  skill -= Math.max(0, (i.targetAc ?? 0) + (i.ammoAcMod ?? 0));
  if (i.targetMultihex) skill += 15;
  return finishToHit({
    skillAfterDistance: skill,
    part: i.part,
    halfPart: !i.ranged,
    ...(i.targetProne !== undefined ? { targetProne: i.targetProne } : {}),
    ...(i.attackerEyesCrippled !== undefined
      ? { attackerEyesCrippled: i.attackerEyesCrippled }
      : {}),
    ...(i.lightPenalty !== undefined ? { lightPenalty: i.lightPenalty } : {}),
    ...(i.recordBonus !== undefined ? { recordBonus: i.recordBonus } : {}),
    ...(i.difficultyMod !== undefined ? { difficultyMod: i.difficultyMod } : {}),
    ...(i.onToHit ? { onToHit: i.onToHit } : {}),
  });
}
