import { describe, expect, it } from 'vitest';
import { ByteReader } from './reader.js';
import { FormatError } from '../errors.js';

describe('ByteReader', () => {
  it('czyta u32be i i16be z naglowka FRM-like', () => {
    const r = new ByteReader(new Uint8Array([0, 0, 0, 4, 0, 8, 0xff, 0xff]));
    expect(r.u32be()).toBe(4);
    expect(r.u16be()).toBe(8);
    expect(r.i16be()).toBe(-1);
    expect(r.remaining).toBe(0);
  });
  it('rzuca FormatError poza buforem', () => {
    expect(() => new ByteReader(new Uint8Array(2)).u32le()).toThrow(FormatError);
  });
  it('czyta u8, u16le i i16le', () => {
    const r = new ByteReader(new Uint8Array([7, 0x34, 0x12, 0xfe, 0xff]));
    expect(r.u8()).toBe(7);
    expect(r.u16le()).toBe(0x1234);
    expect(r.i16le()).toBe(-2);
    expect(r.remaining).toBe(0);
  });
  it('seek ustawia pozycje i rzuca poza buforem', () => {
    const r = new ByteReader(new Uint8Array([1, 2, 3]));
    r.seek(2);
    expect(r.pos).toBe(2);
    expect(r.u8()).toBe(3);
    r.seek(3);
    expect(r.remaining).toBe(0);
    expect(() => r.seek(4)).toThrow(FormatError);
    expect(() => r.seek(-1)).toThrow(FormatError);
  });
  it('bytes() zwraca widok bez kopii', () => {
    const buf = new Uint8Array([1, 2, 3, 4]);
    const r = new ByteReader(buf, 1);
    const v = r.bytes(2);
    expect(Array.from(v)).toEqual([2, 3]);
    buf[1] = 9;
    expect(v[0]).toBe(9);
    expect(v.buffer).toBe(buf.buffer);
  });
  it('bytes() odrzuca NaN, ujemne i ulamkowe n', () => {
    const r = new ByteReader(new Uint8Array(4));
    expect(() => r.bytes(NaN)).toThrow(FormatError);
    expect(() => r.bytes(-1)).toThrow(FormatError);
    expect(() => r.bytes(1.5)).toThrow(FormatError);
  });
  it('odczyt przy remaining=0 rzuca, bytes(0) przechodzi', () => {
    const r = new ByteReader(new Uint8Array(1));
    r.u8();
    expect(r.bytes(0).length).toBe(0);
    expect(() => r.u8()).toThrow(FormatError);
  });
});
