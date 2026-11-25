import { describe, expect, it } from 'vitest';
import {
  selectDeathSlide,
  selectEndgameSlides,
  type DeathRow,
  type EndgameRow,
} from '../src/index.js';

const g = (vals: Record<number, number>) => ({ get: (i: number) => vals[i] ?? 0 });
const sl = (gvar: number, value: number, art: number): EndgameRow & { art: number } => ({
  gvar,
  value,
  art,
});

describe('selectEndgameSlides', () => {
  it('rownosc scisla, kolejnosc pliku', () => {
    const s = [sl(1, 2, 10), sl(0, 1, 11), sl(1, 2, 12), sl(2, 0, 13)];
    expect(selectEndgameSlides(s, g({ 0: 1, 1: 2 })).map((x) => x.art)).toEqual([10, 11, 12, 13]);
    expect(selectEndgameSlides(s, g({ 0: 1, 1: 3, 2: 5 })).map((x) => x.art)).toEqual([11]);
  });
});

const row = (o: Partial<DeathRow> & { chance: number; narrator: string }): DeathRow => ({
  gvar: -1,
  value: 0,
  areaKnown: -1,
  areaNotKnown: -1,
  minLevel: 0,
  ...o,
});
const rng = (n: number) => ({ int: () => n });
const ctx = (over: object = {}) => ({
  gvars: g({}),
  isAreaKnown: () => false,
  level: 1,
  reason: 0 as const,
  rng: rng(0),
  ...over,
});

describe('selectDeathSlide', () => {
  const rows = [
    row({ chance: 20, narrator: 'Generic a' }),
    row({ chance: 20, narrator: 'b' }),
    row({ chance: 20, narrator: 'c' }),
  ];
  it('rzut dzieli przedzialy kumulatywne', () => {
    expect(selectDeathSlide(rows, ctx({ rng: rng(20) })).narrator).toBe('Generic a');
    expect(selectDeathSlide(rows, ctx({ rng: rng(21) })).narrator).toBe('b');
    expect(selectDeathSlide(rows, ctx({ rng: rng(60) })).narrator).toBe('c');
  });
  it('gvar: wiersz kwalifikuje sie gdy gvar < value (0x440cf4, jge skip)', () => {
    const r = [row({ chance: 5, narrator: 'gv', gvar: 0, value: 3 })];
    // gvar=3 => odpada => total 0 => rzut 0 => indeks 0 (absolutny)
    const seen: number[][] = [];
    selectDeathSlide(
      r,
      ctx({ gvars: g({ 0: 3 }), rng: { int: (a: number, b: number) => (seen.push([a, b]), 0) } }),
    );
    expect(seen).toEqual([[0, 0]]);
    selectDeathSlide(
      r,
      ctx({ gvars: g({ 0: 2 }), rng: { int: (a: number, b: number) => (seen.push([a, b]), 0) } }),
    );
    expect(seen[1]).toEqual([0, 5]);
  });
  it('filtry: poziom, areaKnown (musi byc znany), areaNotKnown', () => {
    const r = [
      row({ chance: 1, narrator: 'lvl', minLevel: 10 }),
      row({ chance: 1, narrator: 'ak', areaKnown: 5 }),
      row({ chance: 1, narrator: 'ank', areaNotKnown: 6 }),
    ];
    const seen: number[] = [];
    const rr = { int: (_a: number, b: number) => (seen.push(b), 0) };
    selectDeathSlide(r, ctx({ rng: rr }));
    selectDeathSlide(r, ctx({ rng: rr, level: 10, isAreaKnown: (a: number) => a === 5 }));
    selectDeathSlide(r, ctx({ rng: rr, level: 10, isAreaKnown: (a: number) => a === 6 }));
    expect(seen).toEqual([1, 3, 1]);
  });
  it('indeks absolutny, nie n-ty kwalifikujacy', () => {
    const r = [
      row({ chance: 10, narrator: 'x', minLevel: 99 }),
      row({ chance: 10, narrator: 'y' }),
      row({ chance: 10, narrator: 'z' }),
    ];
    expect(selectDeathSlide(r, ctx({ rng: rng(15) })).narrator).toBe('y');
    expect(selectDeathSlide(r, ctx({ rng: rng(5) })).narrator).toBe('x');
  });
  it('Modoc: gvar 491 != 0 i reason 0 wymusza wiersz 12 bez losowania', () => {
    const r = Array.from({ length: 13 }, (_, i) => row({ chance: 5, narrator: `r${i}` }));
    let called = 0;
    const c = ctx({ gvars: g({ 491: 1 }), rng: { int: () => (called++, 0) } });
    expect(selectDeathSlide(r, c).narrator).toBe('r12');
    expect(called).toBe(0);
    expect(selectDeathSlide(r, { ...c, reason: 1, rng: rng(0) }).narrator).toBe('r0');
  });
  it('wynik spoza tabeli: fallback do pierwszego wiersza Generic', () => {
    const r = [row({ chance: 1, narrator: 'Other' }), row({ chance: 1, narrator: 'Generic 1' })];
    // zaden nie kwalifikuje sie przy level 0? minLevel 5 => total 0, index = 0 => rows[0] istnieje
    expect(selectDeathSlide(r, ctx({ rng: rng(99) })).narrator).toBe('Generic 1');
  });
});
