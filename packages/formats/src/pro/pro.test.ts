import { describe, expect, it } from 'vitest';
import { FormatError } from '../errors.js';
import { ObjType, ProtoFlags, parseProto, pidIndex, pidType, subtypeOfPid } from './index.js';

function build(
  size: number,
  words: Record<number, number>,
  u8s: Record<number, number> = {},
): Uint8Array {
  const b = new Uint8Array(size);
  const v = new DataView(b.buffer);
  for (const [off, val] of Object.entries(words)) v.setUint32(Number(off), val >>> 0, false);
  for (const [off, val] of Object.entries(u8s)) b[Number(off)] = val;
  return b;
}
const hdr = (pid: number) => ({
  0: pid,
  4: (pid & 0xffffff) * 100,
  8: (pid & 0xff000000) + 5,
  12: 4,
  16: 65536,
  20: ProtoFlags.noBlock,
});

describe('pidType / pidIndex', () => {
  it('rozbija pid', () => {
    expect(pidType(0x0100001d)).toBe(ObjType.Critter);
    expect(pidIndex(0x0100001d)).toBe(29);
    expect(pidType(0x05000010)).toBe(ObjType.Misc);
    expect(pidType(0x03000001)).toBe(ObjType.Wall);
  });
});

describe('ProtoFlags', () => {
  it('bity zgodne ze spec', () => {
    expect(ProtoFlags).toEqual({
      hidden: 0x1,
      flat: 0x8,
      noBlock: 0x10,
      multiHex: 0x800,
      transGlass: 0x20000,
      wallTransEnd: 0x10000000,
      lightThru: 0x20000000,
      shootThru: 0x80000000,
    });
  });
});

describe('parseProto (syntetyczne)', () => {
  it('critter 416 B zuzyty w calosci, 412 B bez damageType', () => {
    const w = {
      ...hdr(0x0100001d),
      24: 7,
      28: 0xffffffff,
      32: 0xffffffff,
      36: 3,
      40: 1,
      44: 9,
      48: 11,
      184: 12,
      188: 13,
      324: 14,
      328: 15,
      396: 16,
      400: 2,
      404: 99,
      408: 5,
    };
    const p = parseProto(build(416, { ...w, 412: 4 }));
    expect(p.kind).toBe('critter');
    if (p.kind !== 'critter') return;
    expect(p.pid).toBe(0x0100001d);
    expect(p.index).toBe(29);
    expect(p.textId).toBe(2900);
    expect(p.scriptId).toBe(-1);
    expect(p.headFid).toBe(-1);
    expect(p.baseStats).toHaveLength(35);
    expect(p.baseStats[0]).toBe(11);
    expect(p.baseStats[34]).toBe(12);
    expect(p.bonusStats[0]).toBe(13);
    expect(p.bonusStats[34]).toBe(14);
    expect(p.skills).toHaveLength(18);
    expect(p.skills[0]).toBe(15);
    expect(p.skills[17]).toBe(16);
    expect([p.bodyType, p.expForKill, p.killType, p.damageType]).toEqual([2, 99, 5, 4]);
    const short = parseProto(build(412, w));
    expect(short.kind === 'critter' && short.damageType).toBe(undefined);
  });
  it('item: rozmiar wyznacza podtyp, data ma wlasciwa dlugosc', () => {
    const sizes: Array<[number, number, number]> = [
      [0, 129, 18],
      [1, 65, 2],
      [2, 125, 17],
      [3, 122, 16],
      [4, 81, 6],
      [5, 69, 3],
      [6, 61, 1],
    ];
    for (const [sub, size, words] of sizes) {
      const buf = build(
        size,
        { ...hdr(0x00000001), 32: sub, 36: 2, 52: 0x07000001, [57 + (words - 1) * 4]: 77 },
        { 56: 0x41 },
      );
      expect(subtypeOfPid(buf)).toBe(sub);
      const p = parseProto(buf);
      expect(p.kind).toBe('item');
      if (p.kind !== 'item') return;
      expect(p.subtype).toBe(sub);
      expect(p.data).toHaveLength(words);
      expect(p.data[words - 1]).toBe(77);
      expect(p.tail).toHaveLength(sub === 3 ? 1 : 0);
      expect(p.soundId).toBe(0x41);
      expect(p.invFid).toBe(0x07000001);
    }
  });
  it('scenery 45/49 B wg podtypu', () => {
    const door = parseProto(
      build(49, { ...hdr(0x02000001), 32: 0, 41: 0, 45: 0xffffffff }, { 40: 0x42 }),
    );
    expect(door.kind === 'scenery' && door.data).toEqual([0, -1]);
    const plain = parseProto(build(45, { ...hdr(0x02000002), 32: 5, 41: 3 }));
    expect(plain.kind === 'scenery' && plain.data).toEqual([3]);
    expect(() => parseProto(build(45, { ...hdr(0x02000002), 32: 0 }))).toThrow(FormatError);
    expect(() => parseProto(build(45, { ...hdr(0x02000002), 32: 9 }))).toThrow(FormatError);
  });
  it('wall, tile, misc', () => {
    const w = parseProto(build(36, { ...hdr(0x03000001), 24: 5, 28: 0xffffffff, 32: 6 }));
    expect(w.kind === 'wall' && [w.actionFlags, w.scriptId, w.material]).toEqual([5, -1, 6]);
    const t = parseProto(build(28, { ...hdr(0x04000001), 24: 4 }));
    expect(t.kind === 'tile' && t.material).toBe(4);
    const m = parseProto(build(28, { ...hdr(0x05000010), 24: 0 }));
    expect(m.kind).toBe('misc');
  });
  it('odrzuca zly rozmiar i typ', () => {
    expect(() => parseProto(build(416, hdr(0x00000001)))).toThrow(FormatError);
    expect(() => parseProto(build(416, { ...hdr(0x00000001), 32: 3 }))).toThrow(FormatError);
    expect(() => parseProto(build(415, hdr(0x01000001)))).toThrow(FormatError);
    expect(() => parseProto(build(28, hdr(0x06000001)))).toThrow(FormatError);
    expect(() => parseProto(new Uint8Array(10))).toThrow(FormatError);
    expect(() => subtypeOfPid(new Uint8Array(20))).toThrow(FormatError);
  });
  it('akceptuje Uint8Array z offsetem', () => {
    const inner = build(28, { ...hdr(0x04000001), 24: 3 });
    const outer = new Uint8Array(40);
    outer.set(inner, 6);
    expect(parseProto(outer.subarray(6, 34)).kind).toBe('tile');
  });
});
