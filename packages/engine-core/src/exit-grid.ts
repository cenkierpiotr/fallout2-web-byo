import type { ExitGrid, GameMap } from './game-map.js';
import type { GameObject } from './game-object.js';
import type { Direction } from './hexgrid.js';

/** Exit grid: misc o pid 0x5000010..0x5000017 (pathfinding.md sekcja 5). */
export function isExitGridPid(pid: number): boolean {
  return pid > 0x500000f && pid < 0x5000018;
}

export function exitGridOf(obj: GameObject): ExitGrid | undefined {
  const e = obj.extra;
  if (e.kind !== 'exitGrid' || !isExitGridPid(obj.pid)) return undefined;
  return {
    hex: obj.hex,
    elevation: obj.elevation,
    destMap: e.destMap,
    destHex: e.destHex,
    destElevation: e.destElevation as 0 | 1 | 2,
    destOrientation: e.destRotation as Direction,
  };
}

/** Exit grid na danym heksie i kondygnacji (pathfinding.md sekcja 5), albo undefined. */
export function exitGridAt(map: GameMap, elevation: number, hex: number): ExitGrid | undefined {
  return map.exitGrids.find((e) => e.hex === hex && e.elevation === elevation);
}

/**
 * set_exit_grids(elev, mapa, elewacja docelowa, kafel docelowy, rotacja) (0x80e6, handler 0x457730): dla kazdego
 * obiektu o pid 0x5000010..0x5000017 na elewacji `onElevation` zapisuje mape, kafel i elewacje docelowa
 * (obj+0x3c, +0x40, +0x44); piaty argument (rotacja) jest zdejmowany, ale nie zapisywany (D). Zwraca liczbe zmienionych.
 */
export function setExitGrids(
  map: GameMap,
  onElevation: number,
  destMap: number,
  destElevation: number,
  destHex: number,
): number {
  let n = 0;
  for (const o of map.objects) {
    if (o.elevation !== onElevation || o.extra.kind !== 'exitGrid' || !isExitGridPid(o.pid))
      continue;
    o.extra.destMap = destMap;
    o.extra.destHex = destHex;
    o.extra.destElevation = destElevation;
    n++;
    const eg = exitGridOf(o);
    const i = map.exitGrids.findIndex((e) => e.hex === o.hex && e.elevation === o.elevation);
    if (eg) {
      if (i >= 0) map.exitGrids[i] = eg;
      else map.exitGrids.push(eg);
    }
  }
  return n;
}
