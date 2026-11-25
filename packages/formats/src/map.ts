import { FormatError } from './errors.js';
import { ByteReader } from './io/reader.js';

/** Parser formatu MAP wg dokumentacja techniczna (wszystkie liczby big-endian). */

export interface MapHeader {
  version: number;
  name: string;
  playerHex: number;
  playerElevation: number;
  playerOrientation: number;
  localVarCount: number;
  scriptId: number;
  flags: number;
  darkness: number;
  globalVarCount: number;
  mapId: number;
  time: number;
}

/** 10000 elementow, indeks y*100+x. */
export interface MapTiles {
  floor: Uint16Array;
  roof: Uint16Array;
}

export interface MapScriptRef {
  type: number;
  scriptId: number;
  raw: Int32Array;
}

export type MapObjectExtra =
  | { kind: 'critter'; flags: number; raw: Int32Array }
  | { kind: 'item'; subtype: number; flags: number; raw: Int32Array }
  | {
      kind: 'door' | 'stairs' | 'elevator' | 'ladder' | 'scenery';
      subtype: number;
      flags: number;
      raw: Int32Array;
    }
  | {
      kind: 'exitGrid';
      flags: number;
      destMap: number;
      destHex: number;
      destElevation: number;
      destRotation: number;
    }
  | { kind: 'misc'; flags: number };

export interface MapObject {
  pid: number;
  fid: number;
  hex: number;
  elevation: number;
  frame: number;
  rotation: number;
  flags: number;
  scriptId: number;
  objectId: number;
  localVars: Int32Array;
  inventory: MapObject[];
  quantity: number;
  extra: MapObjectExtra;
  x: number;
  y: number;
  sx: number;
  sy: number;
  cid: number;
  lightRadius: number;
  lightIntensity: number;
  outline: number;
  scriptIdx: number;
}

export interface ParsedMap {
  header: MapHeader;
  globalVars: Int32Array;
  localVars: Int32Array;
  tiles: (MapTiles | null)[];
  scripts: MapScriptRef[];
  objects: MapObject[][];
  /** Pozycja czytnika po ostatnim obiekcie (== rozmiar pliku dla poprawnych map). */
  endOffset: number;
}

const TILES_PER_LEVEL = 10000;
const SCRIPT_SLOTS = 16;
const MAX_INV_DEPTH = 8;
/** Minimalny rozmiar rekordu obiektu: 18 + 3 + 1 u32. */
const MIN_OBJECT_BYTES = 88;

function fail(message: string, offset?: number): never {
  throw new FormatError('map', message, offset);
}

export function hasElevation(flags: number, elevation: 0 | 1 | 2): boolean {
  return (flags & (2 << elevation)) === 0;
}

function readI32Array(r: ByteReader, count: number, what: string): Int32Array {
  if (count * 4 > r.remaining) fail(`za malo danych: ${what}`, r.pos);
  const arr = new Int32Array(count);
  for (let i = 0; i < count; i++) arr[i] = r.u32be() | 0;
  return arr;
}

function readHeader(r: ByteReader): MapHeader {
  const version = r.u32be();
  if (version !== 19 && version !== 20) fail(`nieobslugiwana wersja mapy: ${version}`, 0);
  const nameBytes = r.bytes(16);
  let name = '';
  for (const b of nameBytes) {
    if (b === 0) break;
    name += String.fromCharCode(b);
  }
  const playerHex = r.u32be();
  const playerElevation = r.u32be();
  const playerOrientation = r.u32be();
  const localVarCount = r.u32be();
  const scriptId = r.u32be();
  const flags = r.u32be();
  const darkness = r.u32be();
  const globalVarCount = r.u32be();
  const mapId = r.u32be();
  const time = r.u32be();
  r.seek(r.pos + 44 * 4);
  return {
    version,
    name,
    playerHex,
    playerElevation,
    playerOrientation,
    localVarCount,
    scriptId,
    flags,
    darkness,
    globalVarCount,
    mapId,
    time,
  };
}

function readTiles(r: ByteReader, flags: number): (MapTiles | null)[] {
  const tiles: (MapTiles | null)[] = [null, null, null];
  for (const e of [0, 1, 2] as const) {
    if (!hasElevation(flags, e)) continue;
    if (TILES_PER_LEVEL * 4 > r.remaining) fail(`za malo danych: kafle poziomu ${e}`, r.pos);
    const floor = new Uint16Array(TILES_PER_LEVEL);
    const roof = new Uint16Array(TILES_PER_LEVEL);
    for (let j = 0; j < TILES_PER_LEVEL; j++) {
      const v = r.u32be();
      floor[j] = v & 0xffff;
      roof[j] = v >>> 16;
    }
    tiles[e] = { floor, roof };
  }
  return tiles;
}

/** Rozmiar wpisu (w u32) wynika z gornego bajtu jego pierwszego u32 (typ skryptu), takze dla slotow-smieci. */
function scriptEntrySize(firstWord: number): number {
  const t = firstWord >>> 24;
  return t === 1 ? 18 : t === 2 ? 17 : 16;
}

function readScripts(r: ByteReader): MapScriptRef[] {
  const scripts: MapScriptRef[] = [];
  for (let type = 0; type < 5; type++) {
    const count = r.u32be();
    const blocks = Math.ceil(count / SCRIPT_SLOTS);
    // minimalny rozmiar bloku: 16 slotow po 16 u32 + trailer 2 u32
    if (blocks * (SCRIPT_SLOTS * 16 + 2) * 4 > r.remaining) {
      fail(`za malo danych: skrypty typu ${type}`, r.pos);
    }
    for (let b = 0; b < blocks; b++) {
      const entries: Int32Array[] = [];
      for (let i = 0; i < SCRIPT_SLOTS; i++) {
        const first = r.u32be();
        const raw = new Int32Array(scriptEntrySize(first));
        raw[0] = first | 0;
        for (let j = 1; j < raw.length; j++) raw[j] = r.u32be() | 0;
        entries.push(raw);
      }
      const length = r.u32be();
      r.u32be(); // next (znaczenie Z)
      if (length > SCRIPT_SLOTS) fail(`zla dlugosc bloku skryptow: ${length}`, r.pos - 8);
      for (let i = 0; i < length; i++) {
        const raw = entries[i]!;
        scripts.push({ type, scriptId: raw[0]!, raw });
      }
    }
  }
  return scripts;
}

function readObject(
  r: ByteReader,
  version: number,
  subtypeOf: (pid: number) => number,
  depth: number,
): MapObject {
  if (depth > MAX_INV_DEPTH) fail('za gleboko zagniezdzony ekwipunek', r.pos);
  const objectId = r.u32be();
  const hex = r.u32be() | 0;
  const x = r.u32be() | 0;
  const y = r.u32be() | 0;
  const sx = r.u32be() | 0;
  const sy = r.u32be() | 0;
  const frame = r.u32be();
  const rotation = r.u32be();
  const fid = r.u32be();
  const flags = r.u32be();
  const elevation = r.u32be();
  const pid = r.u32be();
  const cid = r.u32be() | 0;
  const lightRadius = r.u32be();
  const lightIntensity = r.u32be();
  const outline = r.u32be();
  const scriptId = r.u32be() | 0;
  const scriptIdx = r.u32be() | 0;
  const invLength = r.u32be();
  r.u32be(); // inv_capacity
  r.u32be(); // inv_ptr
  if (invLength * MIN_OBJECT_BYTES > r.remaining) fail('za malo danych: ekwipunek', r.pos);

  const type = pid >>> 24;
  const typeFlags = r.u32be();
  let extra: MapObjectExtra;
  if (type === 1) {
    extra = { kind: 'critter', flags: typeFlags, raw: readI32Array(r, 10, 'krytera') };
  } else if (type === 0) {
    const subtype = subtypeOf(pid);
    let n: number;
    if (subtype === 3) n = 2;
    else if (subtype === 4 || subtype === 5 || subtype === 6) n = 1;
    else if (subtype === 0 || subtype === 1 || subtype === 2) n = 0;
    else return fail(`zly podtyp itemu: ${subtype}`, r.pos);
    extra = { kind: 'item', subtype, flags: typeFlags, raw: readI32Array(r, n, 'item') };
  } else if (type === 2) {
    const subtype = subtypeOf(pid);
    let n: number;
    let kind: 'door' | 'stairs' | 'elevator' | 'ladder' | 'scenery';
    if (subtype === 0) [kind, n] = ['door', 1];
    else if (subtype === 1) [kind, n] = ['stairs', 2];
    else if (subtype === 2) [kind, n] = ['elevator', 2];
    else if (subtype === 3 || subtype === 4) [kind, n] = ['ladder', version === 19 ? 1 : 2];
    else if (subtype === 5) [kind, n] = ['scenery', 0];
    else return fail(`zly podtyp scenery: ${subtype}`, r.pos);
    extra = { kind, subtype, flags: typeFlags, raw: readI32Array(r, n, 'scenery') };
  } else if (type === 5 && pid > 0x500000f && pid < 0x5000018) {
    extra = {
      kind: 'exitGrid',
      flags: typeFlags,
      destMap: r.u32be() | 0,
      destHex: r.u32be() | 0,
      destElevation: r.u32be() | 0,
      destRotation: r.u32be() | 0,
    };
  } else {
    extra = { kind: 'misc', flags: typeFlags };
  }

  const inventory: MapObject[] = [];
  for (let i = 0; i < invLength; i++) {
    const quantity = r.u32be();
    const child = readObject(r, version, subtypeOf, depth + 1);
    child.quantity = quantity;
    inventory.push(child);
  }

  return {
    pid,
    fid,
    hex,
    elevation,
    frame,
    rotation,
    flags,
    scriptId,
    objectId,
    localVars: new Int32Array(0),
    inventory,
    quantity: 0,
    extra,
    x,
    y,
    sx,
    sy,
    cid,
    lightRadius,
    lightIntensity,
    outline,
    scriptIdx,
  };
}

function readObjects(
  r: ByteReader,
  version: number,
  subtypeOf: (pid: number) => number,
): MapObject[][] {
  const total = r.u32be();
  const objects: MapObject[][] = [[], [], []];
  let sum = 0;
  for (let e = 0; e < 3; e++) {
    const count = r.u32be();
    sum += count;
    if (count * MIN_OBJECT_BYTES > r.remaining) fail(`za malo danych: obiekty poziomu ${e}`, r.pos);
    const list = objects[e]!;
    for (let i = 0; i < count; i++) list.push(readObject(r, version, subtypeOf, 0));
  }
  if (sum !== total) fail(`suma obiektow ${sum} != total ${total}`, r.pos);
  return objects;
}

/**
 * `subtypeOf(pid)`: podtyp prototypu itemu/scenery (u32 pod offsetem 0x20 w .pro);
 * wywolywana tylko dla pidow typu 0 i 2.
 */
export function parseMap(buf: ArrayBuffer, subtypeOf: (pid: number) => number): ParsedMap {
  const r = new ByteReader(new Uint8Array(buf));
  const header = readHeader(r);
  const globalVars = readI32Array(r, header.globalVarCount, 'zmienne globalne');
  const localVars = readI32Array(r, header.localVarCount, 'zmienne lokalne');
  const tiles = readTiles(r, header.flags);
  const scripts = readScripts(r);
  const objects = readObjects(r, header.version, subtypeOf);
  return { header, globalVars, localVars, tiles, scripts, objects, endOffset: r.pos };
}
