// Ruch po mapie swiata, paliwo, geometria (specyfikacja formatu: 0x4c1f90, 0x4bfe0c, 0x4c4da4).
export const TICKS_PER_TRAVEL_ITERATION = 18000;
export const TILE_W = 350;
export const TILE_H = 300;
export const SUBTILE = 50;

export type Gvars = Readonly<Record<number, number>>;

/**
 * Koszt kroku: koszt terenu minus ranga Pathfindera, minimum 1. Z `pathfinderFix` perk dziala na
 * czas (`scaleTravelTicks`), wiec koszt kroku nie jest obnizany.
 */
export function stepCost(
  terrainCost: number,
  pathfinderRank: number,
  fixes?: Readonly<Record<string, boolean>>,
): number {
  const rank = fixes?.['pathfinderFix'] ? 0 : pathfinderRank;
  return Math.max(1, terrainCost - rank);
}

export function initialStepCounter(): number {
  return 1;
}

/** Licznik 1..4; ruch gdy licznik >= koszt. */
export function travelStep(counter: number, cost: number): { counter: number; moved: boolean } {
  return { moved: counter >= cost, counter: counter >= 4 ? 1 : counter + 1 };
}

/** Liczba wywolan kroku na iteracje; samochod 4 + dodatki z GVAR 439/455/456. */
export function carStepCalls(car: boolean, gv: Gvars): number {
  if (!car) return 1;
  let n = 4;
  if ((gv[439] ?? 0) !== 0) n += 1;
  if ((gv[455] ?? 0) !== 0) n += 1;
  if ((gv[456] ?? 0) !== 0) n += 3;
  return n;
}

/** Spalanie paliwa samochodu; GVAR 456 -> 10%, 455 -> 90%, 453 -> 50%. Nie schodzi ponizej 0. */
export function burnFuel(fuel: number, base: number, gv: Gvars): number {
  let a = base;
  if ((gv[456] ?? 0) !== 0) a = Math.trunc((a * 10) / 100);
  if ((gv[455] ?? 0) !== 0) a = Math.trunc((a * 90) / 100);
  if ((gv[453] ?? 0) !== 0) a = Math.trunc(a / 2);
  return Math.max(0, fuel - a);
}

export function tileIndexAt(x: number, y: number, tilesWide: number): number {
  return Math.floor(y / TILE_H) * tilesWide + Math.floor(x / TILE_W);
}

export function subtileAt(x: number, y: number): { col: number; row: number } {
  return {
    col: Math.floor((((x % TILE_W) + TILE_W) % TILE_W) / SUBTILE),
    row: Math.floor((((y % TILE_H) + TILE_H) % TILE_H) / SUBTILE),
  };
}
