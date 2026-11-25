import { describe, it, expect } from 'vitest';
import { iterateMveRecords, MveFormatError, parseMveHeader } from './mve-chunks.js';

function header(): number[] {
  const m = Array.from('Interplay MVE File', (c) => c.charCodeAt(0));
  return [...m, 0x1a, 0x00, 0x1a, 0x00, 0x00, 0x01, 0x33, 0x11];
}
const u16 = (v: number): number[] => [v & 255, v >> 8];
function op(code: number, version: number, body: number[]): number[] {
  return [...u16(body.length), code, version, ...body];
}
function rec(type: number, ops: number[][]): number[] {
  const body = ops.flat();
  return [...u16(body.length), ...u16(type), ...body];
}

describe('parseMveHeader', () => {
  it('akceptuje poprawny naglowek', () => {
    expect(parseMveHeader(new Uint8Array(header())).headerSize).toBe(26);
  });
  it('odrzuca zly magic i za krotki bufor', () => {
    const bad = header();
    bad[0] = 0x58;
    expect(() => parseMveHeader(new Uint8Array(bad))).toThrow(MveFormatError);
    expect(() => parseMveHeader(new Uint8Array(10))).toThrow(MveFormatError);
  });
  it('odrzuca zle stale', () => {
    const bad = header();
    bad[25] = 0x12;
    expect(() => parseMveHeader(new Uint8Array(bad))).toThrow(MveFormatError);
  });
});

describe('iterateMveRecords', () => {
  it('parsuje rekordy z opkodami', () => {
    const r1 = rec(3, [op(0x0c, 0, [1, 2, 3, 4]), op(0x01, 0, [])]);
    const r2 = rec(1, [op(0x08, 1, [9, 9])]);
    const recs = [...iterateMveRecords(new Uint8Array([...header(), ...r1, ...r2]))];
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ offset: 26, type: 3, length: r1.length - 4 });
    expect(recs[0]!.opcodes.map((o) => o.code)).toEqual([0x0c, 0x01]);
    expect(recs[0]!.opcodes[0]!.data.byteLength).toBe(4);
    expect(recs[1]!.opcodes[0]).toMatchObject({ code: 8, version: 1 });
    expect(recs[0]!.truncated).toBeUndefined();
  });
  it('konczy po rekordzie typu 5', () => {
    const recs = [
      ...iterateMveRecords(new Uint8Array([...header(), ...rec(5, []), ...rec(3, [])])),
    ];
    expect(recs).toHaveLength(1);
  });
  it('ucięty rekord daje truncated bez wyjatku', () => {
    const r = rec(3, [op(0x0c, 0, [1, 2, 3, 4, 5, 6])]);
    const bytes = new Uint8Array([...header(), ...r.slice(0, r.length - 3)]);
    const recs = [...iterateMveRecords(bytes)];
    expect(recs).toHaveLength(1);
    expect(recs[0]!.truncated).toBe(true);
  });
  it('resztka mniejsza niz 4 B konczy bez wyjatku', () => {
    const recs = [...iterateMveRecords(new Uint8Array([...header(), 1, 2]))];
    expect(recs).toHaveLength(0);
  });
});
