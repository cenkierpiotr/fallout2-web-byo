import type { MapObjectExtra, ObjType, Proto } from '@f2/formats';
import type { Direction, Hex } from './hexgrid.js';

/** Obiekt swiata gry (zaladowany z mapy). Flagi `flags` z MAP, `protoFlags` z PRO (domyslne). */
export interface GameObject {
  id: number;
  pid: number;
  fid: number;
  type: ObjType;
  hex: Hex;
  elevation: 0 | 1 | 2;
  rotation: Direction;
  frame: number;
  flags: number;
  protoFlags: number;
  scriptId: number;
  localVars: Int32Array;
  inventory: GameObject[];
  /** Liczba sztuk stosu (wpis ekwipunku z mapy); brak = 1. */
  quantity?: number;
  proto: Proto;
  extra: MapObjectExtra;
  hidden: boolean;
  /** Promien swiatla obiektu z MAP (heksy, 0..8); brak = 0. Zrodlem jest flaga 0x20. */
  lightRadius?: number;
  /** Intensywnosc swiatla obiektu z MAP (0..0x10000). */
  lightIntensity?: number;
}
