import type { MapHeader, MapScriptRef, MapTiles, ObjType } from '@f2/formats';
import type { GameObject } from './game-object.js';
import type { Direction, Hex } from './hexgrid.js';
import { hexNeighbors } from './hexgrid.js';

export interface ExitGrid {
  hex: Hex;
  elevation: 0 | 1 | 2;
  destMap: number;
  destHex: Hex;
  destElevation: 0 | 1 | 2;
  destOrientation: Direction;
}

export interface GameMap {
  name: string;
  header: MapHeader;
  tiles: (MapTiles | null)[];
  objects: GameObject[];
  /** Klucz: elevation * 1e5 + hex. */
  byHex: Map<number, GameObject[]>;
  globalVars: Int32Array;
  localVars: Int32Array;
  scripts: MapScriptRef[];
  exitGrids: ExitGrid[];
}

/** Bity flag obiektu (render-order.md / pathfinding.md sekcja 2). */
const FLAG_HIDDEN = 0x1;
const FLAG_NO_BLOCK = 0x10;
const FLAG_MULTI_HEX = 0x800;

const TYPE_CRITTER = 1 satisfies ObjType;
const TYPE_SCENERY = 2 satisfies ObjType;
const TYPE_WALL = 3 satisfies ObjType;

export function hexKey(elevation: number, hex: Hex): number {
  return elevation * 100000 + hex;
}

export function objectsAt(map: GameMap, elevation: number, hex: Hex): GameObject[] {
  return map.byHex.get(hexKey(elevation, hex)) ?? [];
}

function removeFromIndex(map: GameMap, obj: GameObject): void {
  const key = hexKey(obj.elevation, obj.hex);
  const list = map.byHex.get(key);
  if (!list) return;
  const i = list.indexOf(obj);
  if (i >= 0) list.splice(i, 1);
  if (list.length === 0) map.byHex.delete(key);
}

/** Dodaje obiekt do indeksu byHex (pomija hex spoza siatki). */
export function indexObject(map: GameMap, obj: GameObject): void {
  if (obj.hex < 0) return;
  const key = hexKey(obj.elevation, obj.hex);
  const list = map.byHex.get(key);
  if (list) list.push(obj);
  else map.byHex.set(key, [obj]);
}

export function moveObject(map: GameMap, obj: GameObject, hex: Hex, elevation?: number): void {
  removeFromIndex(map, obj);
  obj.hex = hex;
  if (elevation !== undefined) obj.elevation = elevation as 0 | 1 | 2;
  indexObject(map, obj);
}

function blocksMover(o: GameObject): boolean {
  if ((o.flags & (FLAG_HIDDEN | FLAG_NO_BLOCK)) !== 0) return false;
  const t = o.type as number;
  return t === TYPE_CRITTER || t === TYPE_SCENERY || t === TYPE_WALL;
}

/** Wg specs/pathfinding.md sekcja 2 (bez wyjatku na przechodnie drzwi, ten jest w sciezkach). */
export function isHexBlocked(
  map: GameMap,
  elevation: number,
  hex: Hex,
  ignore?: GameObject,
): boolean {
  for (const o of objectsAt(map, elevation, hex)) {
    if (o !== ignore && blocksMover(o)) return true;
  }
  for (const n of hexNeighbors(hex)) {
    for (const o of objectsAt(map, elevation, n)) {
      if (o !== ignore && (o.flags & FLAG_MULTI_HEX) !== 0 && blocksMover(o)) return true;
    }
  }
  return false;
}

/** Obiekty blokujace heks (jak isHexBlocked, ale zwraca liste; do oceny przechodnich drzwi). */
export function blockingObjects(
  map: GameMap,
  elevation: number,
  hex: Hex,
  ignore?: GameObject,
): GameObject[] {
  const out: GameObject[] = [];
  for (const o of objectsAt(map, elevation, hex)) {
    if (o !== ignore && blocksMover(o)) out.push(o);
  }
  for (const n of hexNeighbors(hex)) {
    for (const o of objectsAt(map, elevation, n)) {
      if (o !== ignore && (o.flags & FLAG_MULTI_HEX) !== 0 && blocksMover(o)) out.push(o);
    }
  }
  return out;
}
