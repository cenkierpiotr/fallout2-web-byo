import { HEX_COUNT, hexInDirection, type Direction } from '@f2/engine-core';

/**
 * Rozchodzenie swiatla obiektu (f2_obj_light_apply, 0x48dc28, specyfikacja formatu/specyfikacja formatu 2026-11-12, D).
 *
 * Siatka swiatla to 40000 hexow x 3 poziomy (int32, sumowana bez ograniczenia: 0x47aa10 dodaje,
 * 0x47aa48 odejmuje). Obiekt swieci na 6 klinach; kazdy klin ma 36 pozycji (wiersz a = 0..7, kolumna
 * c = 1..8-a; pozycja = hex po `a` krokach kierunkiem (d+1)%6, potem `c` krokow kierunkiem d,
 * tablica offsetow 0x639530 budowana w 0x48d020). Pierscien pozycji = a + c (tablica 0x5196dc).
 * Wartosc pierscienia k: I - k*step, step = (I - 0x28f) / (R + 1) (idiv, ujemny krok dozwolony).
 * Pozycja jest zablokowana, gdy zablokowane sa jej rodzice w tym lub nastepnym klinie
 * (36-galeziowy skok 0x48db98, tablica flag 0x6391d0 = `blocked[klin][pozycja]`) albo gdy
 * zatrzymuje ja obiekt na hexie (sciana/nieprzezroczysty obiekt tego samego poziomu).
 */

export const LIGHT_POSITIONS = 36;
export const LIGHT_MAX_RADIUS = 8;
export const LIGHT_MAX_INTENSITY = 0x10000;
export const LIGHT_BASE = 0x28f;

/** Pierscien pozycji (tablica 0x5196dc). */
export const LIGHT_RING: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 2, 3, 4, 5, 6, 7, 8, 3, 4, 5, 6, 7, 8, 4, 5, 6, 7, 8, 5, 6, 7, 8, 6, 7, 8,
  7, 8, 8,
];

/** Flagi obiektu (obj+0x24). */
export const OBJ_FLAG_HIDDEN = 0x1;
export const OBJ_FLAG_LIGHT_SOURCE = 0x20;
/** Obiekt z ta flaga (obj+0x24 & 8) nie zatrzymuje swiatla, gdy jest sciana (0x48e847). */
export const OBJ_FLAG_FLAT = 0x8;
/** Flaga obiektu (obj+0x27 & 0x20 = 0x20000000): swiatlo przechodzi. */
export const OBJ_FLAG_LIGHT_THRU = 0x20000000;
/** Typ FID sciany (bity 24..27 FID). */
export const OBJ_TYPE_WALL = 3;

/** Obiekt na hexie wpływajacy na swiatlo; `protoFlags` = proto+0x18. */
export interface LightBlocker {
  elevation: number;
  flags: number;
  /** Typ obiektu z FID (0 przedmiot, 1 stworzenie, 2 scenerie, 3 sciana, 4 kafel). */
  type: number;
  protoFlags: number;
}

export interface LightSource {
  hex: number;
  elevation: number;
  /** Zasieg w heksach (obciety do 8). */
  radius: number;
  /** Intensywnosc (obcieta do 0x10000). */
  intensity: number;
  /** Flagi obiektu (hidden i 0x20 sprawdzane tak jak w 0x48dc48..0x48dc5e). Domyslnie 0x20. */
  flags?: number;
}

/** Offsety hexow (0x639530): `[parzystosc][klin * 36 + pozycja]`. Budowane jak w 0x48d020. */
function buildOffsets(): Int32Array[] {
  const out: Int32Array[] = [];
  for (const center of [20100, 20101]) {
    const t = new Int32Array(6 * LIGHT_POSITIONS);
    for (let d = 0; d < 6; d++) {
      let idx = 0;
      for (let a = 0; a < 8; a++) {
        const base = hexInDirection(center, ((d + 1) % 6) as Direction, a);
        for (let c = 1; c <= 8 - a; c++) {
          t[d * LIGHT_POSITIONS + idx++] = hexInDirection(base, d as Direction, c) - center;
        }
      }
    }
    out.push(t);
  }
  return out;
}
export const LIGHT_OFFSETS: readonly Int32Array[] = buildOffsets();

/** Pozycja zablokowana przez rodzicow (skok 0x48db98); b(klin, pozycja) czyta tablice flag. */
export function parentBlocked(pos: number, b: (wedge: 0 | 1, p: number) => number): number {
  const c = 0;
  const n = 1;
  switch (pos) {
    case 0:
      return 0;
    case 1:
      return b(c, 0);
    case 2:
      return b(c, 1);
    case 3:
      return b(c, 2);
    case 4:
      return b(c, 3);
    case 5:
      return b(c, 4);
    case 6:
      return b(c, 5);
    case 7:
      return b(c, 6);
    case 8:
      return b(c, 0) & b(n, 0);
    case 9:
      return b(c, 8) & b(c, 1);
    case 10:
      return b(c, 9) & b(c, 2);
    case 11:
      return b(c, 10) & b(c, 3);
    case 12:
      return b(c, 11) & b(c, 4);
    case 13:
      return b(c, 12) & b(c, 5);
    case 14:
      return b(c, 13) & b(c, 6);
    case 15:
      return b(c, 8) & b(n, 1);
    case 16:
      return b(c, 8) | (b(c, 9) & b(c, 15));
    case 17:
      return (
        (b(c, 8) & (b(c, 9) | b(c, 10))) |
        ((b(c, 9) | b(c, 10)) & b(c, 16)) |
        (b(c, 9) & (b(c, 10) | b(c, 15)))
      );
    case 18:
      return (
        (b(c, 10) & b(c, 16)) | b(c, 9) | (b(c, 17) & (b(c, 0) | b(c, 9) | b(c, 10) | b(c, 11)))
      );
    case 19:
      return (b(c, 11) & (b(c, 17) | b(c, 18))) | (b(c, 9) | b(c, 10)) | (b(c, 12) & b(c, 18));
    case 20:
      return (
        (b(c, 8) & (b(c, 2) | b(c, 11) | b(c, 12))) |
        ((b(c, 2) | b(c, 11) | b(c, 12)) & b(c, 9)) |
        b(c, 10) |
        (b(c, 11) & (b(c, 16) | b(c, 17) | b(c, 18) | b(c, 19)))
      );
    case 21:
      return (b(c, 8) & b(n, 1)) | (b(c, 15) & b(n, 2));
    case 22:
      return (
        (b(c, 8) & (b(n, 1) | b(c, 15) | b(c, 21))) |
        ((b(c, 9) | b(c, 21)) & b(c, 15)) |
        ((b(c, 15) | b(c, 21)) & b(c, 16))
      );
    case 23:
      return b(c, 16) | b(c, 3) | (b(c, 9) & b(c, 15)) | (b(c, 17) & b(c, 22));
    case 24:
      return (
        (b(c, 16) & (b(c, 0) | b(c, 9) | b(c, 10) | b(c, 17) | b(c, 18))) |
        (((b(c, 15) | b(c, 16) | b(c, 23)) & b(c, 9)) | b(c, 8)) |
        ((b(c, 15) | b(c, 22) | b(c, 23)) & b(c, 17)) |
        (b(c, 18) & b(c, 23))
      );
    case 25:
      return (
        (b(c, 9) & (b(c, 8) | b(c, 15) | b(c, 16) | b(c, 23) | b(c, 24))) |
        (b(c, 8) & b(c, 1)) |
        ((b(c, 17) | (b(c, 8) | b(c, 16)) | b(c, 24)) & b(c, 10)) |
        b(c, 17) |
        ((b(c, 8) | b(c, 16) | b(c, 23) | b(c, 24)) & b(c, 18)) |
        (b(c, 24) & (b(c, 0) | b(c, 19)))
      );
    case 26:
      return (b(c, 15) & b(n, 2)) | (b(n, 1) & b(c, 8)) | (b(c, 21) & b(n, 3));
    case 27:
      return (
        (b(c, 22) & (b(n, 0) | b(c, 15) | b(c, 21) | b(c, 26))) |
        ((b(c, 8) & b(n, 1)) | b(c, 15)) |
        (b(c, 21) & (b(c, 8) | b(c, 16)))
      );
    case 28:
      return (
        ((b(c, 9) | b(c, 16) | b(c, 23)) & b(c, 15)) |
        b(c, 8) |
        ((b(n, 0) | b(c, 21) | b(c, 22) | b(c, 27)) & b(c, 16)) |
        ((b(c, 9) | b(c, 17) | b(c, 23)) & b(c, 22)) |
        (b(c, 23) & b(c, 27))
      );
    case 29:
      return (
        b(c, 23) |
        (b(c, 8) | b(c, 16)) |
        (b(c, 9) & b(c, 15)) |
        (b(c, 17) & b(c, 22)) |
        (b(c, 24) & b(c, 28))
      );
    case 30:
      return (
        (b(c, 21) & b(n, 3)) | ((b(n, 1) & b(c, 8)) | (b(c, 15) & b(n, 2))) | (b(c, 26) & b(n, 4))
      );
    case 31:
      return (
        b(c, 21) |
        ((b(c, 8) & b(n, 1)) | b(c, 15)) |
        ((b(c, 8) | b(c, 22) | b(c, 27)) & b(c, 26)) |
        (b(c, 27) & b(c, 30))
      );
    case 32:
      return (
        ((b(c, 28) | (b(c, 8) | b(c, 16))) & b(c, 21)) |
        ((b(c, 15) & (b(c, 8) | b(c, 9) | b(c, 16) | b(c, 23) | b(c, 28))) | (b(c, 8) & b(n, 1))) |
        b(c, 22) |
        ((b(c, 8) | b(c, 16) | b(c, 23) | b(c, 28)) & b(c, 27)) |
        ((b(c, 0) | b(c, 31)) & b(c, 28))
      );
    case 33:
      return (
        (b(c, 26) & b(n, 4)) |
        ((b(c, 8) & b(n, 1)) | (b(c, 15) & b(n, 2)) | (b(c, 21) & b(n, 3))) |
        (b(c, 30) & b(n, 5))
      );
    case 34:
      return (
        (b(c, 8) & (b(n, 2) | b(c, 26) | b(c, 30))) |
        ((b(n, 2) | b(c, 26) | b(c, 30)) & b(c, 15)) |
        b(c, 21) |
        (b(c, 26) & (b(c, 16) | b(c, 22) | b(c, 27) | b(c, 31)))
      );
    case 35:
      return (
        (b(c, 30) & b(n, 5)) |
        ((b(n, 1) & b(c, 8)) | (b(c, 15) & b(n, 2)) | (b(c, 21) & b(n, 3)) | (b(c, 26) & b(n, 4))) |
        (b(c, 33) & b(n, 6))
      );
    default:
      return 0;
  }
}

/**
 * Czy obiekt na hexie (ten sam poziom, nie ukryty) blokuje swiatlo pozycji i czy swiatlo jest
 * w ogole nakladane na ten hex (`lit`, edi w 0x48e7c4). 0x48e7d1..0x48e916.
 */
function blockerEffect(
  o: LightBlocker,
  dir: number,
  pos: number,
): { blocks: boolean; litNo: boolean } {
  const blocks = (o.flags & OBJ_FLAG_LIGHT_THRU) === 0;
  let litNo = false;
  if (o.type !== OBJ_TYPE_WALL) {
    if (blocks && dir >= 1 && dir <= 3) litNo = true;
    return { blocks, litNo };
  }
  if ((o.flags & OBJ_FLAG_FLAT) !== 0) return { blocks, litNo };
  const f = o.protoFlags >>> 0;
  let lit: boolean;
  if ((f & 0x8000000) !== 0 || (f & 0x40000000) !== 0) {
    lit = dir === 4 || dir === 5 || (dir === 0 && pos < 8) || (dir === 3 && pos > 15);
  } else if ((f & 0x10000000) !== 0) {
    lit = dir === 0 || dir === 5;
  } else if ((f & 0x20000000) !== 0) {
    lit = dir === 0 || dir === 1 || dir === 4 || dir === 5 || (dir === 3 && pos > 15);
  } else {
    lit = dir === 0 || dir === 1 || (dir === 5 && pos > 7);
  }
  return { blocks, litNo: !lit };
}

/**
 * Nakladanie (sign = 1) lub zdejmowanie (sign = -1) swiatla zrodla. `add(hex, delta)` dodaje do
 * siatki poziomu zrodla (zakres hexow sprawdza wywolujacy lub tablica). `blockersAt(hex)` zwraca
 * obiekty na hexie w kolejnosci listy hexa (rosnaco po poziomie, jak 0x639da0).
 * Zwraca false gdy zrodlo odrzucone (0x48dc48..0x48dc7e: brak intensywnosci, ukryte, bez flagi 0x20,
 * hex poza siatka).
 */
export function spreadLight(
  src: LightSource,
  blockersAt: (hex: number) => Iterable<LightBlocker>,
  add: (hex: number, delta: number) => void,
  sign: 1 | -1 = 1,
): boolean {
  const flags = src.flags ?? OBJ_FLAG_LIGHT_SOURCE;
  const intensity = Math.min(LIGHT_MAX_INTENSITY, src.intensity);
  const dist = Math.min(LIGHT_MAX_RADIUS, src.radius);
  if (intensity <= 0) return false;
  if ((flags & OBJ_FLAG_HIDDEN) !== 0 || (flags & OBJ_FLAG_LIGHT_SOURCE) === 0) return false;
  if (!(src.hex >= 0 && src.hex < HEX_COUNT)) return false;

  add(src.hex, sign * intensity);
  const step = Math.trunc((intensity - LIGHT_BASE) / (dist + 1));
  const offsets = LIGHT_OFFSETS[src.hex & 1] as Int32Array;
  const blocked = new Uint8Array(6 * LIGHT_POSITIONS);
  for (let pos = 0; pos < LIGHT_POSITIONS; pos++) {
    const ring = LIGHT_RING[pos] as number;
    if (dist < ring) continue;
    const value = intensity - ring * step;
    for (let dir = 0; dir < 6; dir++) {
      const nxt = (dir + 1) % 6;
      let isBlocked =
        parentBlocked(
          pos,
          (w, p) => blocked[(w === 0 ? dir : nxt) * LIGHT_POSITIONS + p] as number,
        ) !== 0;
      if (!isBlocked) {
        const hex = src.hex + (offsets[dir * LIGHT_POSITIONS + pos] as number);
        if (hex >= 0 && hex < HEX_COUNT) {
          let lit = true;
          for (const o of blockersAt(hex)) {
            if ((o.flags & OBJ_FLAG_HIDDEN) !== 0) continue;
            if (o.elevation > src.elevation) break;
            if (o.elevation !== src.elevation) continue;
            const e = blockerEffect(o, dir, pos);
            isBlocked = e.blocks;
            if (e.litNo) lit = false;
            if (isBlocked) break;
          }
          if (lit) add(hex, sign * value);
        }
      }
      blocked[dir * LIGHT_POSITIONS + pos] = isBlocked ? 1 : 0;
    }
  }
  return true;
}
