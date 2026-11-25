import type { Frm, Palette } from '@f2/formats';
import { describe, expect, it } from 'vitest';
import { renderSheet } from './render.js';

const frame = () => ({
  width: 2,
  height: 2,
  offsetX: 0,
  offsetY: 0,
  pixels: new Uint8Array([1, 1, 1, 1]),
});
const dirs = [frame(), frame()];
const frm: Frm = {
  version: 4,
  fps: 10,
  actionFrame: 0,
  framesPerDirection: 2,
  shiftX: new Int16Array(6),
  shiftY: new Int16Array(6),
  directionOffsets: new Uint32Array(6),
  dataSize: 0,
  distinctDirections: 1,
  directions: [dirs, dirs, dirs, dirs, dirs, dirs],
};
const rgba = new Uint8Array(1024);
rgba.set([9, 8, 7, 255], 4);
const pal: Palette = { rgba, special: new Uint8Array(256), lookup15: new Uint8Array(0) };

describe('renderSheet', () => {
  it('2 klatki 2x2 -> 5x2, przerwa przezroczysta', () => {
    const r = renderSheet(frm, pal, 0);
    expect([r.width, r.height]).toEqual([5, 2]);
    expect(Array.from(r.rgba.subarray(0, 4))).toEqual([9, 8, 7, 255]);
    expect(Array.from(r.rgba.subarray(8, 12))).toEqual([0, 0, 0, 0]);
    expect(Array.from(r.rgba.subarray(12, 16))).toEqual([9, 8, 7, 255]);
  });
  it('kumulatywny offsetY przesuwa klatki', () => {
    const f2 = {
      ...frm,
      directions: [[frame(), { ...frame(), offsetY: 3 }], ...frm.directions.slice(1)],
    };
    expect(renderSheet(f2, pal, 0).height).toBe(5);
  });
  it('kumulatywny offsetX przesuwa klatki', () => {
    const f2 = {
      ...frm,
      directions: [[frame(), { ...frame(), offsetX: 4 }], ...frm.directions.slice(1)],
    };
    // druga klatka: baza 3 + offset 4 => x=7, szerokosc 9
    expect(renderSheet(f2, pal, 0).width).toBe(9);
  });
  it('zly kierunek', () => {
    expect(() => renderSheet(frm, pal, 6)).toThrow();
  });
});
