import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePng } from './png.js';

function idat(png: Uint8Array): Uint8Array {
  const v = new DataView(png.buffer, png.byteOffset);
  let o = 8;
  while (o < png.length) {
    const len = v.getUint32(o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    if (type === 'IDAT') return png.subarray(o + 8, o + 8 + len);
    o += 12 + len;
  }
  throw new Error('brak IDAT');
}

describe('encodePng', () => {
  it('1x1 czerwony', () => {
    const png = encodePng(new Uint8ClampedArray([255, 0, 0, 255]), 1, 1);
    expect(Array.from(png.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(png.length).toBeGreaterThan(60);
    expect(Array.from(inflateSync(idat(png)))).toEqual([0, 255, 0, 0, 255]);
  });
  it('zly rozmiar bufora', () => {
    expect(() => encodePng(new Uint8ClampedArray(3), 1, 1)).toThrow();
  });
});
