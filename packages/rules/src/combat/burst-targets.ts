import { RollResult, rollCheck } from '../roll.js';
import type { Rng } from '../types.js';
import type { ShotGeometry } from './line.js';

/**
 * Rozklad celow serii (0x423488, specyfikacja formatu, D): trzy promienie od atakujacego (srodkowy przez cel, lewy i
 * prawy przez heks sasiedni wzgledem pivota), kazdy do konca zasiegu broni; trafienia kazdego
 * promienia liczy 0x423284 (resolveBurst), tu wolany jako callback `ray`.
 * 0x423128 (przekierowanie pudla, callback `missRedirect`): D, patrz `burstMissRedirect`. Z: globalny limit extras 6 miedzy
 * promieniami (siedzi w 0x423284), generowanie obrazen extras 0x422ec4, ammo poza rules.
 */

/** Szerokosc/liczba heksow mapy 0x66be04 / 0x66be20 (domyslna mapa 200x200). */
export const MAP_HEX_WIDTH = 200;
export const MAP_HEX_COUNT = 40000;

/** 0x4b1d20: heks na brzegu mapy (pierwszy/ostatni wiersz lub skrajna kolumna); poza siatka = false. */
export function isMapBorderHex(hex: number, width = MAP_HEX_WIDTH, count = MAP_HEX_COUNT): boolean {
  if (hex < 0 || hex >= count) return false;
  if (hex < width) return true;
  if (hex >= count - width) return true;
  const m = hex % width;
  return m === 0 || m === width - 1;
}

/**
 * 0x4b1b84: Bresenham w pikselach od srodka `from` przez srodek `to` i DALEJ (bez konca linii);
 * zwraca heks po `dist` zmianach heksa albo pierwszy heks brzegowy mapy. dist <= 0 lub from == to -> from.
 * Z: gdy piksel wypada poza siatke (oryginal petli sie bez konca) zwracamy ostatni poprawny heks.
 */
export function tileBeyond(
  geo: Pick<ShotGeometry, 'hexCenter' | 'pixelToHex'>,
  from: number,
  to: number,
  dist: number,
): number {
  if (dist <= 0 || from === to) return from;
  const s = geo.hexCenter(from);
  const e = geo.hexCenter(to);
  let x = s.x;
  let y = s.y;
  const dx2 = Math.abs(e.x - x) * 2;
  const dy2 = Math.abs(e.y - y) * 2;
  const sx = Math.sign(e.x - x);
  const sy = Math.sign(e.y - y);
  const xDominant = dx2 > dy2;
  let err = xDominant ? dy2 - (dx2 >> 1) : dx2 - (dy2 >> 1);
  let last = from;
  let count = 0;
  for (let guard = 0; guard < 400 * 32; guard++) {
    const hex = geo.pixelToHex(x, y);
    if (hex < 0) return last;
    if (hex !== last) {
      count++;
      if (count === dist) return hex;
      if (isMapBorderHex(hex)) return hex;
      last = hex;
    }
    if (xDominant) {
      if (err >= 0) {
        err -= dx2;
        y += sy;
      }
      x += sx;
      err += dy2;
    } else {
      if (err >= 0) {
        err -= dy2;
        x += sx;
      }
      y += sy;
      err += dx2;
    }
  }
  return last;
}

export interface BurstRoundSplit {
  /** Pociski promienia srodkowego (po odjeciu wstepnych rzutow zostanie center - trafienia). */
  center: number;
  left: number;
  right: number;
  /** Liczba wstepnych rzutow (roll_check z szansa, krytyk 0). */
  preRolls: number;
}

/** Podzial rund z 0x423488 (0x4234ea..0x42355c). */
export function burstRoundSplit(mode: 'burst' | 'flame', rounds: number): BurstRoundSplit {
  if (mode !== 'burst') return { center: 1, left: 1, right: 1, preRolls: 1 };
  let center = Math.trunc(rounds / 3);
  if (center === 0) center = 1;
  const left = Math.trunc(rounds / 3);
  const right = rounds - center - left;
  let preRolls = Math.trunc(center / 2);
  if (preRolls === 0) {
    preRolls = 1;
    center -= 1;
  }
  return { center, left, right, preRolls };
}

export interface BurstSpreadInput {
  mode: 'burst' | 'flame';
  /** Szansa trafienia glownego celu (0..100). */
  toHit: number;
  /** Statystyka CriticalChance atakujacego (0x4aef48, stat 0xf). */
  critChance: number;
  ammo: number;
  burstRounds: number;
  critsEnabled: boolean;
  attackerHex: number;
  targetHex: number;
  /** Zasieg broni w trybie (0x478a1c). */
  range: number;
  geo: Pick<ShotGeometry, 'hexCenter' | 'pixelToHex' | 'neighbor' | 'directionTo'>;
  /** Dystans heksowy (0x48bbd4). */
  distance(a: number, b: number): number;
  /** 0x423128 (D, `burstMissRedirect`): nowy heks celu gdy pocisk zostal przekierowany, null gdy nie. */
  missRedirect(): number | null;
  /** 0x423284 dla jednego promienia: heks konca i liczba rund; zwraca trafienia glownego celu. */
  ray(endHex: number, rounds: number): number;
  /** Liczba krytterow dopisanych do listy extras (rekord+0x3c) po wszystkich promieniach. */
  extrasCount(): number;
}

export interface BurstRayEnds {
  center: number;
  /** Koniec promienia lewego / prawego; null gdy sasiad pivota lezy poza siatka. */
  left: number | null;
  right: number | null;
}

/**
 * Konce trzech promieni serii (0x423488): srodkowy przez cel, boczne przez sasiadow pivota (cel, a gdy blizej niz 4
 * heksy: heks 3 od atakujacego na linii) o kierunkach dir+1 i dir+5 (dir = kierunek pivot -> atakujacy).
 */
export function burstRayEnds(
  i: Pick<BurstSpreadInput, 'attackerHex' | 'range' | 'geo' | 'distance'>,
  target: number,
): BurstRayEnds {
  const a = i.attackerHex;
  const pivot = i.distance(a, target) > 3 ? target : tileBeyond(i.geo, a, target, 3);
  const dir = i.geo.directionTo(pivot, a);
  const side = (d: number): number | null => {
    const nb = i.geo.neighbor(pivot, d % 6);
    return nb < 0 ? null : tileBeyond(i.geo, a, nb, i.range);
  };
  return {
    center: tileBeyond(i.geo, a, target, i.range),
    left: side(dir + 1),
    right: side(dir + 5),
  };
}

export interface BurstSpreadResult {
  /** Liczba wystrzelonych rund (min(ammo, seria)). */
  rounds: number;
  hits: number;
  result: RollResult;
}

const CRIT_SUCCESS_BONUS = 20;

export function resolveBurstSpread(i: BurstSpreadInput, rng: Rng): BurstSpreadResult {
  const rounds = Math.min(i.ammo, i.burstRounds);
  let result = rollCheck(i.toHit, i.critChance, rng, i.critsEnabled);
  const chance = result === RollResult.CriticalSuccess ? i.toHit + CRIT_SUCCESS_BONUS : i.toHit;
  const split = burstRoundSplit(i.mode, rounds);

  let hits = 0;
  for (let k = 0; k < split.preRolls; k++) {
    if (rollCheck(chance, 0, rng, i.critsEnabled) >= RollResult.Success) hits++;
  }
  let target = i.targetHex;
  if (hits === 0) {
    const redirected = i.missRedirect();
    if (redirected !== null) {
      hits = 1;
      target = redirected;
    }
  }

  const ends = burstRayEnds(i, target);
  hits += i.ray(ends.center, split.center - hits);
  // Z: sasiad poza siatka (<0) - oryginal przekazalby -1 dalej, tu promien bez trafien
  hits += ends.left === null ? 0 : i.ray(ends.left, split.left);
  hits += ends.right === null ? 0 : i.ray(ends.right, split.right);

  const extras = i.extrasCount();
  if (result === RollResult.Failure) {
    if (hits > 0 || extras > 0) result = RollResult.Success;
  } else if (result >= RollResult.Success && hits === 0 && extras === 0) {
    result = RollResult.Failure;
  }
  return { rounds, hits, result };
}

/** Obiekt widziany przez przekierowanie pudla serii (0x423128). */
export interface MissRedirectObject {
  hex: number;
  /** Flaga +0x27 & 0x80 (bit 31 slowa flag +0x24, ShootThru): obiekt pomijany. */
  hidden: boolean;
  isCritter: boolean;
  /** To oryginalny cel ataku (+0x20): pomijany bez rzutu. */
  isTarget: boolean;
  /** 0x42dd18 (D, is_dead: kryter z HP < 1 lub flaga +0x44 & 0x80) != 0: szansa wymuszona na 5. */
  busy: boolean;
  /** 0x4243a8 (szansa trafienia tego krytera, czesc ciala = tors, z dystansem). */
  toHit: number;
}

/**
 * 0x423128 (D, specyfikacja formatu 2026-11-13): po pudle serii pocisk leci dalej wzdluz linii od atakujacego, koniec = 0x4b1b84
 * (`tileBeyond`, dystans = zasieg broni). Idzie krokiem 0x4163c8; pomija obiekty ukryte (+0x27&0x80) bez zmiany
 * heksa startu. Pierwszy obiekt niebedacy krytterem jest trafiony (blokuje, bez rzutu). Kryter inny niz cel:
 * szansa = toHit/3 (5 gdy 0x42dd18), rzut 1..100 <= szansa trafia go; inaczej linia idzie dalej od jego heksa.
 * Oryginalny cel jest pomijany bez rzutu. Zwraca trafiony obiekt albo null (brak przekierowania); wtedy
 * oryginal ustawia czesc ciala (+0x28) na 3 (tors), a przy trafieniu nowy cel/heks i flage +0x15 |= 1.
 */
export function burstMissRedirect<O extends MissRedirectObject>(
  attackerHex: number,
  endHex: number,
  next: (startHex: number, prev: O | null) => O | null,
  rng: Rng,
): O | null {
  let start = attackerHex;
  let obj: O | null = null;
  for (let guard = 0; guard < 256; guard++) {
    if (start === endHex) return null;
    obj = next(start, obj);
    if (!obj) return null;
    if (obj.hidden) continue;
    if (!obj.isCritter) return obj;
    if (!obj.isTarget) {
      let chance = Math.trunc(obj.toHit / 3);
      if (obj.busy) chance = 5;
      if (rng.int(1, 100) <= chance) return obj;
    }
    start = obj.hex;
  }
  return null;
}
