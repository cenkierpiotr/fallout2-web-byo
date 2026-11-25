import { describe, expect, it } from 'vitest';
import { PIXEL_HEX_TABLE, pixelToHexOriginal } from '../src/index.js';

/** tile_coord 0x4b1674 + (16, 8) przy Ox=Oy=Hc=Hr=0 (ramka hexgrid.ts). */
function center(hex: number): { x: number; y: number } {
  const hx = hex % 200;
  const hy = (hex - hx) / 200;
  const c = 199 - hx;
  return { x: 24 * c + 8 * (c & 1) + 16 * hy + 16, y: -6 * c + 6 * (c & 1) + 12 * hy + 8 };
}

describe('pixelToHexOriginal (0x4b1754, tablica 0x66b9c4)', () => {
  it('tablica 16x32; wiersze 4..11 zerowe; rogi z generatora', () => {
    expect(PIXEL_HEX_TABLE.length).toBe(16 * 32);
    for (let r = 4; r < 12; r++)
      for (let c = 0; c < 32; c++) expect(PIXEL_HEX_TABLE[r * 32 + c]).toBe(0);
    expect(PIXEL_HEX_TABLE[0]).toBe(1); // 64 > 0
    expect(PIXEL_HEX_TABLE[15]).toBe(1); // 64-4*15=4 > 0
    expect(PIXEL_HEX_TABLE[16]).toBe(0); // 0 > 0 nie
    expect(PIXEL_HEX_TABLE[31]).toBe(2); // 4*15=60 > 0
    expect(PIXEL_HEX_TABLE[12 * 32]).toBe(3); // 0 > 0 nie -> 3
  });
  it('poza siatka -> -1', () => {
    expect(pixelToHexOriginal(-5000, -5000)).toBe(-1);
    expect(pixelToHexOriginal(99999, 99999)).toBe(-1);
  });
  it('odwrotnosc tile_coord: srodek kazdego z 40000 heksow wraca na siebie', () => {
    let bad = 0;
    for (let h = 0; h < 40000; h++) {
      const p = center(h);
      if (pixelToHexOriginal(p.x, p.y) !== h) bad++;
    }
    expect(bad).toBe(0);
  });
  it('kazdy heks w srodku mapy ma dokladnie 384 piksele (16x24)', () => {
    const h = 20000 + 100;
    const own = new Map<number, number>();
    const c = center(h);
    for (let y = c.y - 40; y < c.y + 40; y++)
      for (let x = c.x - 60; x < c.x + 60; x++) {
        const r = pixelToHexOriginal(x, y);
        own.set(r, (own.get(r) ?? 0) + 1);
      }
    expect(own.get(h)).toBe(384);
  });
});
