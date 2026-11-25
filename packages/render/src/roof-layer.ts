import {
  TILE_GRID,
  hexToTile,
  hexToWorld,
  worldToHex,
  type GameMap,
  type GameObject,
} from '@f2/engine-core';
import type { IsoCamera } from './iso-camera.js';
import type { TileLayer } from './tile-layer.js';

/** Indeks "pusty dach" (map.md: wartosc 1 w 98.7% komorek). */
const EMPTY_ROOF = 1;
const MAX_RADIUS = 30;
const ROOF_DY = 96;

const FLAG_TRANS_MASK = 0xfc000;
const GLASS_ALPHA = 0.5;

interface Cache {
  playerTile: number;
  hidden: Uint8Array;
}
const cache = new WeakMap<object, Cache>();

/** Kafel dachu przykrywajacy postac: dach lezy 96 px wyzej niz podloga (hexgrid.md). */
function coveringRoofTile(player: GameObject): number {
  if (player.hex < 0) return -1;
  const p = hexToWorld(player.hex);
  const h = worldToHex(p.x, p.y + ROOF_DY);
  return h < 0 ? -1 : hexToTile(h);
}

function hiddenSet(map: GameMap, player: GameObject): Uint8Array | null {
  const tiles = map.tiles[player.elevation];
  if (!tiles) return null;
  const start = coveringRoofTile(player);
  const hit = cache.get(tiles);
  if (hit && hit.playerTile === start) return hit.hidden;
  const hidden = new Uint8Array(TILE_GRID * TILE_GRID);
  if (start >= 0 && (tiles.roof[start] as number) !== EMPTY_ROOF) {
    const sx = start % TILE_GRID;
    const sy = Math.floor(start / TILE_GRID);
    const stack = [start];
    hidden[start] = 1;
    while (stack.length > 0) {
      const t = stack.pop() as number;
      const x = t % TILE_GRID;
      const y = Math.floor(t / TILE_GRID);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= TILE_GRID || ny >= TILE_GRID) continue;
        if (Math.abs(nx - sx) > MAX_RADIUS || Math.abs(ny - sy) > MAX_RADIUS) continue;
        const n = ny * TILE_GRID + nx;
        if (hidden[n] || (tiles.roof[n] as number) === EMPTY_ROOF) continue;
        hidden[n] = 1;
        stack.push(n);
      }
    }
  }
  cache.set(tiles, { playerTile: start, hidden });
  return hidden;
}

/**
 * Alfa kafla dachu: 0 dla spojnego obszaru niepustego dachu nad graczem (budynek, w ktorym stoi),
 * 1 poza nim. Regula ukrywania w oryginale to Z (render-order.md, Niewiadome): uproszczenie.
 */
export function roofAlphaFor(tileIndex: number, player: GameObject, map: GameMap): number {
  const set = hiddenSet(map, player);
  return set && set[tileIndex] ? 0 : 1;
}

/** Zbior ukrytych kafli dachu liczony raz na klatke (a nie raz na kafel); null = nic nie ukryte. */
export function hiddenRoofTiles(map: GameMap, player: GameObject): Uint8Array | null {
  return hiddenSet(map, player);
}

/**
 * Alfa obiektu wg flag przezroczystosci (maska 0xfc000, render-order.md): szklo, para, energia,
 * czerwona i "sciana" daja polprzezroczystosc (wartosc 0.5 to Z, oryginal uzywa tabel mieszania).
 * Wykrawanie scian wokol gracza wymaga prostokata klatki i jest poza zakresem M2.
 */
export function wallAlphaFor(obj: GameObject, player: GameObject): number {
  void player;
  const bits = obj.flags & FLAG_TRANS_MASK;
  if (bits === 0 || bits === 0x8000) return 1;
  return GLASS_ALPHA;
}

export class RoofLayer {
  constructor(private readonly tiles: TileLayer) {}

  draw(
    map: GameMap,
    _elevation: number,
    cam: IsoCamera,
    player: GameObject,
    lightAt?: (tileIndex: number) => number,
  ): void {
    const hidden = hiddenRoofTiles(map, player);
    this.tiles.drawRoof(cam, hidden ? (i) => (hidden[i] ? 0 : 1) : () => 1, lightAt);
  }
}
