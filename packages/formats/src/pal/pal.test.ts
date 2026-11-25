import { describe, expect, it } from 'vitest';
import { FormatError } from '../errors.js';
import { applyColorCycles, COLOR_CYCLES } from './cycles.js';
import { parsePal } from './index.js';

function mk(): Uint8Array {
  const b = new Uint8Array(768);
  b[3] = 63; // indeks 1, R
  for (let i = 0; i < 768; i++) if (b[i] === 0) b[i] = i % 64;
  b[229 * 3] = 255;
  return b;
}

describe('parsePal', () => {
  it('6-bit -> 8-bit', () => {
    expect(parsePal(mk()).rgba[4]).toBe(252);
  });
  it('indeks 0 ma alpha 0, reszta 255', () => {
    const p = parsePal(mk());
    expect(p.rgba[3]).toBe(0);
    expect(p.rgba[7]).toBe(255);
  });
  it('special dla skladowej > 63', () => {
    const p = parsePal(mk());
    expect(p.special[229]).toBe(1);
    expect(p.special[1]).toBe(0);
  });
  it('lookup15 pusty dla 768 B, 32768 dla 33536 B', () => {
    expect(parsePal(mk()).lookup15.length).toBe(0);
    expect(parsePal(new Uint8Array(33536)).lookup15.length).toBe(32768);
  });
  it('zla dlugosc -> FormatError', () => {
    expect(() => parsePal(new Uint8Array(100))).toThrow(FormatError);
  });
});

describe('applyColorCycles', () => {
  it('obraca o klatke co 200 ms, reszta bez zmian', () => {
    const p = parsePal(mk());
    const a = new Uint8Array(1024);
    const b = new Uint8Array(1024);
    applyColorCycles(p, 0, a);
    applyColorCycles(p, 200, b);
    expect(Array.from(b.slice(230 * 4, 230 * 4 + 4))).toEqual(
      Array.from(a.slice(229 * 4, 229 * 4 + 4)),
    );
    const inCycle = (i: number) =>
      COLOR_CYCLES.some((c) => i >= c.firstIndex && i < c.firstIndex + c.count);
    for (let i = 0; i < 256; i++) {
      if (inCycle(i)) continue;
      expect(Array.from(b.slice(i * 4, i * 4 + 4))).toEqual(Array.from(a.slice(i * 4, i * 4 + 4)));
    }
  });

  const run = (t: number): Uint8Array => {
    const o = new Uint8Array(1024);
    applyColorCycles(parsePal(mk()), t, o);
    return o;
  };
  const same = (a: Uint8Array, b: Uint8Array) => expect(Array.from(a)).toEqual(Array.from(b));

  it('czas ujemny, NaN i Infinity dzialaja jak 0', () => {
    const z = run(0);
    same(run(-1), z);
    same(run(-1e9), z);
    same(run(Number.NaN), z);
    same(run(Number.POSITIVE_INFINITY), z);
    same(run(Number.NEGATIVE_INFINITY), z);
  });
  it('okresy cykli zgodne z binarka (specyfikacja formatu R3-U1: bramki 0x42e9a9, 0x42ebd2, 0x42ecc8, 0x42edbf)', () => {
    const periods = Object.fromEntries(COLOR_CYCLES.map((c) => [c.name, c.periodMs]));
    expect(periods).toEqual({
      slime: 200,
      shore: 200,
      fire_slow: 200,
      fire_fast: 142,
      monitors: 100,
      alarm: 33,
    });
  });
  it('granica 199/200 ms', () => {
    // slime (229..232, okres 200 ms)
    const slime = (t: number) => run(t).slice(229 * 4, 233 * 4);
    same(slime(199), slime(0));
    expect(Array.from(slime(200))).not.toEqual(Array.from(slime(0)));
  });
  it('zawiniecie: count klatek daje identycznosc w zakresie danego cyklu', () => {
    for (const c of COLOR_CYCLES) {
      const lo = c.firstIndex * 4;
      const hi = (c.firstIndex + c.count) * 4;
      same(run(c.count * c.periodMs).slice(lo, hi), run(0).slice(lo, hi));
    }
    // okresy sa rozne (200/100/200/142/200 ms): po 60*200*142*100 ms wszystkie cykle wracaja
    same(run(60 * 200 * 142 * 100 * 1), run(0));
  });
  it('rotacja po wielu klatkach: slime po 5 klatkach = po 1', () => {
    same(run(5 * 200).slice(229 * 4, 233 * 4), run(200).slice(229 * 4, 233 * 4));
  });
  it('alarm (count=1) nigdy sie nie zmienia', () => {
    const base = run(0).slice(254 * 4, 255 * 4);
    for (const t of [0, 200, 400, 1000, 123456]) {
      same(run(t).slice(254 * 4, 255 * 4), base);
    }
  });
  it('zla dlugosc out lub base.rgba -> FormatError', () => {
    const p = parsePal(mk());
    expect(() => applyColorCycles(p, 0, new Uint8Array(1023))).toThrow(FormatError);
    expect(() =>
      applyColorCycles({ ...p, rgba: new Uint8Array(10) }, 0, new Uint8Array(1024)),
    ).toThrow(FormatError);
  });
});
