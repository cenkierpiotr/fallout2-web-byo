/** Parser plikow PRO (prototypy obiektow). Wszystko big-endian. Zob. dokumentacja techniczna */
import { FormatError } from '../errors.js';
import { ByteReader } from '../io/reader.js';

export const enum ObjType {
  Item = 0,
  Critter = 1,
  Scenery = 2,
  Wall = 3,
  Tile = 4,
  Misc = 5,
}

/** Bity pola flags prototypu (spec pro.md, render-order.md). */
export const ProtoFlags: Readonly<
  Record<
    | 'flat'
    | 'noBlock'
    | 'multiHex'
    | 'transGlass'
    | 'lightThru'
    | 'shootThru'
    | 'wallTransEnd'
    | 'hidden',
    number
  >
> = {
  hidden: 0x1,
  flat: 0x8,
  noBlock: 0x10,
  multiHex: 0x800,
  transGlass: 0x20000,
  wallTransEnd: 0x10000000,
  lightThru: 0x20000000,
  shootThru: 0x80000000,
};

export interface ProtoHeader {
  pid: number;
  type: ObjType;
  index: number;
  textId: number;
  fid: number;
  lightDistance: number;
  lightIntensity: number;
  flags: number;
}

export interface ItemProto extends ProtoHeader {
  kind: 'item';
  extFlags: number;
  /** -1 = brak skryptu. */
  scriptId: number;
  /** 0 pancerz, 1 pojemnik, 2 drug, 3 bron, 4 amunicja, 5 misc, 6 klucz. */
  subtype: number;
  material: number;
  size: number;
  weight: number;
  cost: number;
  invFid: number;
  soundId: number;
  /** Surowe u32 danych podtypu od offsetu 57 (nazwy pol: Z). */
  data: number[];
  /** Bajty za u32 danych: tylko bron (podtyp 3) ma 1 bajt (57 + 16*4 = 121, plik ma 122 B); inaczej []. */
  tail: number[];
}
export interface CritterProto extends ProtoHeader {
  kind: 'critter';
  extFlags: number;
  scriptId: number;
  headFid: number;
  aiPacket: number;
  team: number;
  critterFlags: number;
  baseStats: number[];
  bonusStats: number[];
  skills: number[];
  bodyType: number;
  expForKill: number;
  killType: number;
  /** undefined w plikach 412 B. */
  damageType: number | undefined;
}
export interface SceneryProto extends ProtoHeader {
  kind: 'scenery';
  actionFlags: number;
  scriptId: number;
  /** 0 drzwi, 1 schody, 2 winda, 3 drabina dolna, 4 drabina gorna, 5 zwykly. */
  subtype: number;
  material: number;
  soundId: number;
  /** Dane podtypu (i32): 2 elementy dla podtypow 0..2, 1 dla 3..5. */
  data: number[];
}
export interface WallProto extends ProtoHeader {
  kind: 'wall';
  actionFlags: number;
  scriptId: number;
  material: number;
}
export interface TileProto extends ProtoHeader {
  kind: 'tile';
  material: number;
}
export interface MiscProto extends ProtoHeader {
  kind: 'misc';
  extFlags: number;
}
export type Proto = ItemProto | CritterProto | SceneryProto | WallProto | TileProto | MiscProto;

/** Rozmiar pliku, liczba u32 danych (od offsetu 57) i bajty ogona per podtyp itemu. */
export const PROTO_ITEM_SIZES: Readonly<
  Record<number, { size: number; words: number; tail: number }>
> = {
  0: { size: 129, words: 18, tail: 0 },
  1: { size: 65, words: 2, tail: 0 },
  2: { size: 125, words: 17, tail: 0 },
  3: { size: 122, words: 16, tail: 1 },
  4: { size: 81, words: 6, tail: 0 },
  5: { size: 69, words: 3, tail: 0 },
  6: { size: 61, words: 1, tail: 0 },
};

/** Rozmiar pliku i liczba i32 danych (od offsetu 41) per podtyp scenery. */
export const PROTO_SCENERY_SIZES: Readonly<Record<number, { size: number; words: number }>> = {
  0: { size: 49, words: 2 },
  1: { size: 49, words: 2 },
  2: { size: 49, words: 2 },
  3: { size: 45, words: 1 },
  4: { size: 45, words: 1 },
  5: { size: 45, words: 1 },
};

export function pidType(pid: number): ObjType {
  return (pid >>> 24) as ObjType;
}

export function pidIndex(pid: number): number {
  return pid & 0xffffff;
}

function toU8(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

/** Podtyp (u32 BE z offsetu 0x20); sensowny dla itemu i scenery. */
export function subtypeOfPid(buf: ArrayBuffer | Uint8Array): number {
  const u8 = toU8(buf);
  if (u8.length < 36) throw new FormatError('pro', `za krotki plik PRO (${u8.length} B)`, 32);
  return new ByteReader(u8, 32).u32be();
}

function expectSize(len: number, ok: number | readonly number[], what: string): void {
  const list = typeof ok === 'number' ? [ok] : ok;
  if (!list.includes(len)) {
    throw new FormatError(
      'pro',
      `zly rozmiar PRO ${what}: ${len} B, oczekiwano ${list.join(' lub ')}`,
    );
  }
}

export function parseProto(buf: ArrayBuffer | Uint8Array): Proto {
  const u8 = toU8(buf);
  if (u8.length < 24) throw new FormatError('pro', `za krotki plik PRO (${u8.length} B)`, 0);
  const r = new ByteReader(u8);
  const pid = r.u32be();
  const type = pidType(pid);
  if (type > 5) throw new FormatError('pro', `nieznany typ obiektu ${type} w pid`, 0);
  const textId = r.u32be();
  const fid = r.u32be();
  const header: ProtoHeader = {
    pid,
    type,
    index: pidIndex(pid),
    textId,
    fid,
    lightDistance: r.u32be(),
    lightIntensity: r.u32be(),
    flags: r.u32be(),
  };
  const i32 = (): number => r.u32be() | 0;
  const words = (n: number, signed: boolean): number[] => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(signed ? i32() : r.u32be());
    return out;
  };

  switch (type) {
    case ObjType.Tile:
      expectSize(u8.length, 28, 'kafla');
      return { ...header, kind: 'tile', material: r.u32be() };
    case ObjType.Misc:
      expectSize(u8.length, 28, 'misc');
      return { ...header, kind: 'misc', extFlags: r.u32be() };
    case ObjType.Wall: {
      expectSize(u8.length, 36, 'sciany');
      const actionFlags = r.u32be();
      const scriptId = i32();
      return { ...header, kind: 'wall', actionFlags, scriptId, material: r.u32be() };
    }
    case ObjType.Scenery: {
      expectSize(u8.length, [45, 49], 'scenery');
      const actionFlags = r.u32be();
      const scriptId = i32();
      const subtype = r.u32be();
      const info = PROTO_SCENERY_SIZES[subtype];
      if (!info) throw new FormatError('pro', `nieznany podtyp scenery ${subtype}`, 32);
      expectSize(u8.length, info.size, `scenery podtyp ${subtype}`);
      const material = r.u32be();
      const soundId = r.u8();
      return {
        ...header,
        kind: 'scenery',
        actionFlags,
        scriptId,
        subtype,
        material,
        soundId,
        data: words(info.words, true),
      };
    }
    case ObjType.Item: {
      if (u8.length < 36) throw new FormatError('pro', `za krotki PRO itemu (${u8.length} B)`, 32);
      const extFlags = r.u32be();
      const scriptId = i32();
      const subtype = r.u32be();
      const info = PROTO_ITEM_SIZES[subtype];
      if (!info) throw new FormatError('pro', `nieznany podtyp itemu ${subtype}`, 32);
      expectSize(u8.length, info.size, `itemu podtyp ${subtype}`);
      const material = r.u32be();
      const size = r.u32be();
      const weight = r.u32be();
      const cost = r.u32be();
      const invFid = r.u32be();
      const soundId = r.u8();
      const data = words(info.words, false);
      const tail: number[] = [];
      for (let i = 0; i < info.tail; i++) tail.push(r.u8());
      return {
        ...header,
        kind: 'item',
        extFlags,
        scriptId,
        subtype,
        material,
        size,
        weight,
        cost,
        invFid,
        soundId,
        data,
        tail,
      };
    }
    case ObjType.Critter: {
      expectSize(u8.length, [412, 416], 'krytera');
      const extFlags = r.u32be();
      const scriptId = i32();
      const headFid = i32();
      const aiPacket = i32();
      const team = r.u32be();
      const critterFlags = r.u32be();
      const baseStats = words(35, false);
      const bonusStats = words(35, false);
      const skills = words(18, false);
      const bodyType = r.u32be();
      const expForKill = r.u32be();
      const killType = r.u32be();
      const damageType = u8.length === 416 ? r.u32be() : undefined;
      return {
        ...header,
        kind: 'critter',
        extFlags,
        scriptId,
        headFid,
        aiPacket,
        team,
        critterFlags,
        baseStats,
        bonusStats,
        skills,
        bodyType,
        expForKill,
        killType,
        damageType,
      };
    }
  }
}
