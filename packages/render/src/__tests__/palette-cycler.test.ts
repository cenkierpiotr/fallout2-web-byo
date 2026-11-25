import { describe, expect, it } from 'vitest';
import { PaletteCycler } from '../palette/PaletteCycler.js';

function basePal(): Uint8Array {
  const a = new Uint8Array(1024);
  for (let i = 0; i < 256; i++) a.set([i, 255 - i, 7, 255], i * 4);
  return a;
}
const px = (p: Uint8Array, i: number): number[] => [p[i * 4]!, p[i * 4 + 1]!, p[i * 4 + 2]!];

describe('PaletteCycler', () => {
  it('okresy domyslnych cykli zgodne z binarka (specyfikacja formatu R3-U1)', () => {
    const periods = Object.fromEntries(
      PaletteCycler.DEFAULT_CYCLES.map((c) => [c.name, c.periodMs]),
    );
    expect(periods).toEqual({
      slime: 200,
      monitors: 100,
      fire_slow: 200,
      fire_fast: 142,
      shore: 200,
      alarm: 33,
    });
  });

  it('tick(0) po konstrukcji nic nie zmienia', () => {
    expect(new PaletteCycler(basePal()).tick(0)).toBe(false);
  });

  it('po jednym okresie slime kolory wedruja ku wyzszym indeksom', () => {
    const c = new PaletteCycler(basePal());
    expect(c.tick(200)).toBe(true);
    expect(px(c.getPalette(), 229)).toEqual([43, 131, 27]);
    expect(px(c.getPalette(), 230)).toEqual([0, 108, 0]);
  });

  it('indeksy poza cyklami bez zmian', () => {
    const c = new PaletteCycler(basePal());
    c.tick(1234);
    for (const i of [1, 10, 200, 228, 255]) expect(px(c.getPalette(), i)).toEqual([i, 255 - i, 7]);
  });

  it('speedFactor 2 zwalnia dwukrotnie', () => {
    const a = new PaletteCycler(basePal(), undefined, 1);
    const b = new PaletteCycler(basePal(), undefined, 2);
    a.tick(200);
    b.tick(400);
    expect(Array.from(b.getPalette())).toEqual(Array.from(a.getPalette()));
  });

  it('pelny obrot wraca do fazy 0, direction -1 jest odwrotne', () => {
    const c = new PaletteCycler(basePal());
    const p0 = Array.from(c.getPalette());
    c.tick(4 * 200);
    expect(px(c.getPalette(), 229)).toEqual([0, 108, 0]);
    c.tick(0);
    expect(Array.from(c.getPalette())).toEqual(p0);
    const rev = new PaletteCycler(
      basePal(),
      PaletteCycler.DEFAULT_CYCLES.map((x) => ({ ...x, direction: -1 as const })),
    );
    rev.tick(200);
    expect(px(rev.getPalette(), 229)).toEqual([11, 115, 7]);
  });

  it('isEmissive', () => {
    const c = new PaletteCycler(basePal());
    expect(c.isEmissive(233)).toBe(true);
    expect(c.isEmissive(254)).toBe(true);
    expect(c.isEmissive(10)).toBe(false);
    expect(c.isEmissive(255)).toBe(false);
  });

  it('NaN, ujemny i Infinity sprowadzane do 0', () => {
    const c = new PaletteCycler(basePal());
    for (const t of [NaN, -5, Infinity, -Infinity]) expect(() => c.tick(t)).not.toThrow();
    expect(px(c.getPalette(), 229)).toEqual([0, 108, 0]);
  });

  it('alarm: fala trojkatna R 0..60 krokiem 4, G=B=0', () => {
    const c = new PaletteCycler(basePal());
    const seen: number[] = [];
    for (let k = 0; k < 31; k++) {
      c.tick(k * 33);
      seen.push(c.getPalette()[254 * 4]!);
      expect(px(c.getPalette(), 254).slice(1)).toEqual([0, 0]);
    }
    expect(Math.max(...seen)).toBe(60);
    expect(Math.min(...seen)).toBe(0);
    expect(seen[15]).toBe(60);
    expect(seen[30]).toBe(0);
    for (let k = 1; k < seen.length; k++) expect(Math.abs(seen[k]! - seen[k - 1]!)).toBe(4);
  });

  it('walidacja konstruktora', () => {
    expect(() => new PaletteCycler(new Uint8Array(1023))).toThrow();
    expect(
      () =>
        new PaletteCycler(basePal(), [
          { name: 'x', first: 1, last: 2, periodMs: 10, direction: 1, colors: new Uint8Array(3) },
        ]),
    ).toThrow();
  });
});
