import type { GameMap, GameObject } from '@f2/engine-core';

export function obj(p: Partial<GameObject> & Record<string, unknown> = {}): GameObject {
  return {
    id: 1,
    pid: 0,
    fid: 0,
    type: 2,
    hex: 20000,
    elevation: 0,
    rotation: 0,
    frame: 0,
    flags: 0,
    protoFlags: 0,
    scriptId: -1,
    localVars: new Int32Array(0),
    inventory: [],
    proto: {} as GameObject['proto'],
    extra: {} as GameObject['extra'],
    hidden: false,
    ...p,
  } as GameObject;
}

export function mapWith(
  objects: GameObject[],
  tiles: GameMap['tiles'] = [null, null, null],
): GameMap {
  return { objects, tiles, byHex: new Map() } as unknown as GameMap;
}
