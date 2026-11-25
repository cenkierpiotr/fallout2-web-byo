import { describe, expect, it } from 'vitest';
import { FormatError } from '../errors.js';
import { frameToRgba } from './to-rgba.js';
import { frmExtensionDirection, parseFrm } from './index.js';

type F = [number, number, number[]];
interface B {
  fps?: number;
  frames: F[];
  dirs?: number[];
  dataSizeDelta?: number;
}
/** Buduje FRM: kazdy odrebny dirOffset dostaje kopie listy klatek. */
function buildFrm({
  fps = 10,
  frames,
  dirs = [0, 0, 0, 0, 0, 0],
  dataSizeDelta = 0,
}: B): Uint8Array {
  const blockSize = frames.reduce((s, f) => s + 12 + f[2].length, 0);
  const maxOff = Math.max(...dirs);
  const total = 62 + maxOff + blockSize;
  const buf = new Uint8Array(total);
  const v = new DataView(buf.buffer);
  v.setUint32(0, 4);
  v.setUint16(4, fps);
  v.setUint16(6, 0);
  v.setUint16(8, frames.length);
  for (let i = 0; i < 6; i++) v.setInt16(10 + i * 2, i);
  for (let i = 0; i < 6; i++) v.setInt16(22 + i * 2, -i);
  for (let i = 0; i < 6; i++) v.setUint32(34 + i * 4, dirs[i]!);
  v.setUint32(58, total - 62 + dataSizeDelta);
  for (const off of new Set(dirs)) {
    let p = 62 + off;
    for (const [w, h, px] of frames) {
      v.setUint16(p, w);
      v.setUint16(p + 2, h);
      v.setUint32(p + 4, px.length);
      v.setInt16(p + 8, -3);
      v.setInt16(p + 10, 7);
      buf.set(px, p + 12);
      p += 12 + px.length;
    }
  }
  return buf;
}

describe('parseFrm', () => {
  it('1 kierunek, wspolne offsety', () => {
    const f = parseFrm(buildFrm({ frames: [[2, 2, [0, 1, 2, 3]]] }));
    expect(f.directions[0]![0]!.width).toBe(2);
    expect(f.directions[0]![0]!.offsetX).toBe(-3);
    expect(f.directions[0]![0]!.offsetY).toBe(7);
    expect(f.distinctDirections).toBe(1);
    expect(f.directions[5]![0]).toBe(f.directions[0]![0]);
    expect(Array.from(f.shiftY)).toEqual([0, -1, -2, -3, -4, -5]);
  });
  it('6 kierunkow z roznymi offsetami', () => {
    const frames: F[] = [[1, 1, [5]]];
    // kazdy blok ma 13 B
    const f = parseFrm(buildFrm({ frames, dirs: [0, 13, 26, 39, 52, 65] }));
    expect(f.distinctDirections).toBe(6);
    expect(f.directions[3]![0]).not.toBe(f.directions[0]![0]);
  });
  it('size != w*h -> FormatError frm', () => {
    const b = buildFrm({ frames: [[2, 2, [0, 1, 2, 3]]] });
    new DataView(b.buffer).setUint32(62 + 4, 3);
    expect(() => parseFrm(b)).toThrow(FormatError);
    try {
      parseFrm(b);
    } catch (e) {
      expect((e as FormatError).format).toBe('frm');
    }
  });
  it('dataSize o 1 za duzy -> FormatError', () => {
    expect(() => parseFrm(buildFrm({ frames: [[2, 2, [0, 1, 2, 3]]], dataSizeDelta: 1 }))).toThrow(
      FormatError,
    );
  });
  it('singleDirection: 3', () => {
    const b = buildFrm({ frames: [[2, 2, [0, 1, 2, 3]]], dataSizeDelta: 99 });
    const f = parseFrm(b, { singleDirection: 3 });
    expect(f.directions[3]!.length).toBe(1);
    expect(f.directions[0]!.length).toBe(0);
    expect(f.distinctDirections).toBe(1);
  });
  it('bledna wersja, obciety plik, dirOffset poza plikiem, duzy rozmiar', () => {
    const ok = buildFrm({ frames: [[2, 2, [0, 1, 2, 3]]] });
    expect(() => parseFrm(ok.subarray(0, 40))).toThrow(FormatError);
    expect(() => parseFrm(ok.subarray(0, 70), { singleDirection: 0 })).toThrow(FormatError);
    const v = ok.slice();
    new DataView(v.buffer).setUint32(0, 3);
    expect(() => parseFrm(v)).toThrow(FormatError);
    const o = ok.slice();
    new DataView(o.buffer).setUint32(34, 9999);
    expect(() => parseFrm(o, { singleDirection: 0 })).toThrow(FormatError);
    const big = ok.slice();
    const bv = new DataView(big.buffer);
    bv.setUint16(62, 65535);
    bv.setUint16(64, 65535);
    bv.setUint32(66, 65535 * 65535);
    expect(() => parseFrm(big)).toThrow(FormatError);
    expect(() => parseFrm(ok, { singleDirection: 6 })).toThrow(FormatError);
  });
});

describe('frameToRgba', () => {
  it('indeks 0 przezroczysty, 1 z palety', () => {
    const pal = new Uint8Array(1024);
    pal.set([10, 20, 30, 77], 4);
    const out = frameToRgba(
      { width: 2, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8Array([0, 1]) },
      pal,
    );
    expect(Array.from(out)).toEqual([0, 0, 0, 0, 10, 20, 30, 255]);
  });
  it('za krotka paleta -> FormatError', () => {
    const fr = { width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8Array(1) };
    expect(() => frameToRgba(fr, new Uint8Array(10))).toThrow(FormatError);
  });
});

describe('frmExtensionDirection', () => {
  it('rozszerzenia', () => {
    expect(frmExtensionDirection('X.FR4')).toBe(4);
    expect(frmExtensionDirection('a.fr0')).toBe(0);
    expect(frmExtensionDirection('a.frm')).toBeUndefined();
  });
});
