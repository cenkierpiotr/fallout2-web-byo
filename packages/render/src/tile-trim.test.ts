import { describe, expect, it } from 'vitest';
import { computeTileBands } from './tile-trim.js';

function img(w: number, h: number, rows: Array<[number, number] | null>): Uint8Array {
  const p = new Uint8Array(w * h);
  rows.forEach((r, y) => {
    if (r) for (let x = r[0]; x <= r[1]; x++) p[y * w + x] = 7;
  });
  return p;
}

describe('computeTileBands', () => {
  it('1 pasmo = ramka ciasna wokol nieprzezroczystych pikseli', () => {
    const p = img(8, 4, [null, [2, 5], [1, 6], null]);
    expect(computeTileBands(p, 8, 4, 1)).toEqual([{ x0: 1, y0: 1, x1: 7, y1: 3 }]);
  });
  it('pasma tna wiersze wg zakresu x w obrebie pasma, pokrywajac wszystkie nieprzezroczyste piksele', () => {
    const rows: Array<[number, number]> = [
      [3, 4],
      [3, 4],
      [1, 6],
      [1, 6],
    ];
    const p = img(8, 4, rows);
    const b = computeTileBands(p, 8, 4, 2);
    expect(b).toEqual([
      { x0: 3, y0: 0, x1: 5, y1: 2 },
      { x0: 1, y0: 2, x1: 7, y1: 4 },
    ]);
  });
  it('puste pasma sa pomijane, pusty kafel daje []', () => {
    expect(computeTileBands(new Uint8Array(8 * 8), 8, 8, 4)).toEqual([]);
    const p = img(4, 4, [[0, 3], null, null, null]);
    expect(computeTileBands(p, 4, 4, 4)).toEqual([{ x0: 0, y0: 0, x1: 4, y1: 1 }]);
  });
  it('nigdy nie gubi piksela i pasma sie nie nakladaja', () => {
    const w = 20;
    const h = 13;
    const p = new Uint8Array(w * h);
    let s = 12345;
    for (let i = 0; i < p.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      p[i] = s % 3 === 0 ? 1 : 0;
    }
    for (const n of [1, 3, 4, 6]) {
      const bands = computeTileBands(p, w, h, n);
      let prevEnd = 0;
      for (const b of bands) {
        expect(b.y0).toBeGreaterThanOrEqual(prevEnd);
        prevEnd = b.y1;
      }
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if (p[y * w + x] !== 0)
            expect(bands.some((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1)).toBe(true);
    }
  });
});
