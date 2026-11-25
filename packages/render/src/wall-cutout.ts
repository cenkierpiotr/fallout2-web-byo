import { hexToWorld } from '@f2/engine-core';

/**
 * Wykrawanie scian wokol gracza (f2_render_object, 0x48f1b0, 0x48f3f2..0x48f510; specyfikacja formatu 2026-11-12, D).
 *
 * `f2_tile_compare_slope` (0x4b1994) i bliznia (0x4b1a00) biora (heksA, heksB), zamieniaja je na
 * piksele (0x4b1674) i zwracaja 1, gdy `(xB - xA) <= (yB - yA) * C`; C = -4.0 (0x50e7c7) dla
 * pierwszej, 1.3333333333333335 (0x50e7cf) dla drugiej.
 */

export const CUTOUT_SLOPE_A = -4.0;
export const CUTOUT_SLOPE_B = 1.3333333333333335;

/** Bity proto extFlags (proto + 0x18) wybierajace kombinacje porownan. */
export const PROTO_EXT_CUT_A = 0x8000000;
export const PROTO_EXT_CUT_B = 0x10000000;
export const PROTO_EXT_CUT_C = 0x20000000;
export const PROTO_EXT_CUT_D = 0x80000000;

/** Flaga obiektu (+0x24): ukryty. Maska 0xfc000 to flagi przezroczystosci. */
export const OBJ_FLAG_HIDDEN = 0x1;
export const OBJ_FLAGS_TRANSPARENCY_MASK = 0xfc000;
/** Bajt +0x27 bit 4 (flaga obiektu 0x10000000). */
export const OBJ_FLAG_NO_CUTOUT = 0x10000000;

function slope(a: number, b: number, c: number): boolean {
  const pa = hexToWorld(a);
  const pb = hexToWorld(b);
  return pb.x - pa.x <= (pb.y - pa.y) * c;
}

/** 0x4b1994: porownanie ze stala -4.0. */
export function tileCompareSlopeA(hexA: number, hexB: number): boolean {
  return slope(hexA, hexB, CUTOUT_SLOPE_A);
}
/** 0x4b1a00: porownanie ze stala ~1.3333. */
export function tileCompareSlopeB(hexA: number, hexB: number): boolean {
  return slope(hexA, hexB, CUTOUT_SLOPE_B);
}

export interface CutoutInput {
  /** Typ obiektu: tylko 2 (scenery) i 3 (wall) sa wykrawane. */
  readonly objType: number;
  readonly objHex: number;
  readonly objFlags: number;
  readonly protoExtFlags: number;
  readonly playerHex: number;
  readonly playerFlags: number;
}

/** Czy obiekt ma byc narysowany jako wykroj wokol gracza (D, 0x48f3f2..0x48f510). */
export function wallCutout(i: CutoutInput): boolean {
  if (i.objType !== 2 && i.objType !== 3) return false;
  if ((i.playerFlags & OBJ_FLAG_HIDDEN) !== 0) return false;
  if ((i.objFlags & OBJ_FLAGS_TRANSPARENCY_MASK) !== 0) return false;
  if (i.objHex < 0 || i.playerHex < 0) return false;
  const w = i.objHex;
  const h = i.playerHex;
  const p = i.protoExtFlags >>> 0;
  const noCut = (i.objFlags & OBJ_FLAG_NO_CUTOUT) !== 0;
  if ((p & (PROTO_EXT_CUT_A | PROTO_EXT_CUT_D)) !== 0) {
    return !noCut && tileCompareSlopeA(w, h) && tileCompareSlopeB(w, h);
  }
  if ((p & PROTO_EXT_CUT_B) !== 0) {
    return tileCompareSlopeA(w, h) || tileCompareSlopeB(h, w);
  }
  if ((p & PROTO_EXT_CUT_C) !== 0) {
    return tileCompareSlopeA(w, h) && tileCompareSlopeB(h, w);
  }
  return !noCut && tileCompareSlopeB(h, w) && tileCompareSlopeA(h, w);
}
