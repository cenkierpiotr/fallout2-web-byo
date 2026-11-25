import type { GameMap } from '../game-map.js';
import { indexObject } from '../game-map.js';
import type { GameObject } from '../game-object.js';

export function emptyMap(): GameMap {
  return {
    name: 'T',
    header: { playerHex: 20100, playerElevation: 0, playerOrientation: 0 } as GameMap['header'],
    tiles: [{ floor: new Uint16Array(0), roof: new Uint16Array(0) }, null, null],
    objects: [],
    byHex: new Map(),
    globalVars: new Int32Array(0),
    localVars: new Int32Array(0),
    scripts: [],
    exitGrids: [],
  };
}

let nextId = 1;
export function fake(
  type: number,
  hex: number,
  flags = 0,
  extra: GameObject['extra'] = { kind: 'misc', flags: 0 },
  elevation: 0 | 1 | 2 = 0,
): GameObject {
  return {
    id: nextId++,
    pid: type << 24,
    fid: 0,
    type,
    hex,
    elevation,
    rotation: 0,
    frame: 0,
    flags,
    protoFlags: 0,
    scriptId: -1,
    localVars: new Int32Array(0),
    inventory: [],
    proto: undefined as never,
    extra,
    hidden: (flags & 1) !== 0,
  };
}

export function door(hex: number, bits = 0): GameObject {
  return fake(2, hex, 0, { kind: 'door', subtype: 0, flags: 0, raw: new Int32Array([bits]) });
}

export function put(map: GameMap, o: GameObject): GameObject {
  map.objects.push(o);
  indexObject(map, o);
  return o;
}
