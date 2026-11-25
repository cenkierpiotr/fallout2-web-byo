import { describe, expect, it } from 'vitest';
import { MveDecoder } from './mve-decoder.js';

const u16 = (v: number): number[] => [v & 255, v >> 8];
const op = (code: number, body: number[]): number[] => [...u16(body.length), code, 0, ...body];
const rec = (type: number, ops: number[][]): number[] => {
  const b = ops.flat();
  return [...u16(b.length), ...u16(type), ...b];
};
const header = (): number[] => [
  ...Array.from('Interplay MVE File', (c) => c.charCodeAt(0)),
  0x1a,
  0,
  0x1a,
  0,
  0,
  1,
  0x33,
  0x11,
];
/** 16x8: dwa bloki, tryb E (wypelnienie) kolorem 1 i 2. */
function movie(videoBody: number[]): Uint8Array {
  const pal = [1, 0, ...u16(3), 0, 0, 0, 63, 0, 0, 0, 63, 0];
  const video = [...new Array(14).fill(0), ...videoBody];
  return new Uint8Array([
    ...header(),
    ...rec(0, [
      op(0x0a, [...u16(16), ...u16(8), 0, 0]),
      op(0x05, [...u16(2), ...u16(1), 0, 0, 0, 0]),
    ]),
    ...rec(3, [op(0x0c, pal), op(0x0f, [0xee]), op(0x11, video)]),
  ]);
}

describe('MveDecoder', () => {
  it('dekoduje klatke syntetyczna przez palete', () => {
    const d = new MveDecoder(movie([2, 3]));
    const f = d.nextFrame();
    expect(f).not.toBeNull();
    expect(d.width).toBe(16);
    expect(f!.rgba.length).toBe(16 * 8 * 4);
    expect([...f!.rgba.slice(0, 4)]).toEqual([252, 0, 0, 255]);
    expect([...f!.rgba.slice(8 * 4, 8 * 4 + 4)]).toEqual([0, 252, 0, 255]);
    expect(f!.isKeyframe).toBe(true);
    expect(d.nextFrame()).toBeNull();
    expect(d.error).toBeNull();
  });
  it('zly plik rzuca wyjatek', () => {
    expect(() => new MveDecoder(new Uint8Array(40))).toThrow();
  });
  it('urwane dane 0x11 daja null i error', () => {
    const d = new MveDecoder(movie([2]));
    expect(d.nextFrame()).toBeNull();
    expect(d.error).not.toBeNull();
  });
});
