import { describe, expect, it } from 'vitest';
import type { DeathSlide, EndgameSlide } from '@f2/formats';
import { GvarRegistry, selectDeath, selectEndgameSlides } from '../index.js';

const reg = (vals: number[]) =>
  new GvarRegistry(
    vals.map((_, i) => `G${i}`),
    vals,
  );
const sl = (gvar: number, value: number, art: number): EndgameSlide => ({
  gvar,
  value,
  art,
  narrator: `n${art}`,
  direction: 0,
  line: 0,
});

describe('selectEndgameSlides', () => {
  it('rownosc scisla, kolejnosc pliku', () => {
    const slides = [sl(1, 2, 10), sl(0, 1, 11), sl(1, 2, 12), sl(2, 0, 13)];
    const out = selectEndgameSlides(slides, reg([1, 2, 0]));
    expect(out.map((s) => s.art)).toEqual([10, 11, 12, 13]);
    expect(selectEndgameSlides(slides, reg([1, 3, 5])).map((s) => s.art)).toEqual([11]);
  });
  it('brakujacy gvar liczy sie jako 0', () => {
    expect(selectEndgameSlides([sl(99, 0, 1), sl(99, 1, 2)], reg([])).map((s) => s.art)).toEqual([
      1,
    ]);
  });
});

const row = (o: Partial<DeathSlide> & { chance: number; narrator: string }): DeathSlide => ({
  gvar: -1,
  value: 0,
  areaKnown: -1,
  areaNotKnown: -1,
  minLevel: 0,
  line: 0,
  ...o,
});
const rng = (n: number) => ({ int: () => n });
const ctx = (over: object = {}) => ({
  gvars: reg([0]),
  areaKnown: () => false,
  level: 1,
  reason: 0 as const,
  rng: rng(0),
  ...over,
});

describe('selectDeath', () => {
  const rows = [
    row({ chance: 20, narrator: 'a' }),
    row({ chance: 20, narrator: 'b' }),
    row({ chance: 20, narrator: 'c' }),
  ];
  it('rzut dzieli przedzialy kumulatywne', () => {
    expect(selectDeath(rows, ctx({ rng: rng(10) }))?.narrator).toBe('a');
    expect(selectDeath(rows, ctx({ rng: rng(20) }))?.narrator).toBe('a');
    expect(selectDeath(rows, ctx({ rng: rng(21) }))?.narrator).toBe('b');
    expect(selectDeath(rows, ctx({ rng: rng(60) }))?.narrator).toBe('c');
  });
  it('rng dostaje przedzial [0,total]', () => {
    const seen: number[][] = [];
    selectDeath(rows, ctx({ rng: { int: (a: number, b: number) => (seen.push([a, b]), 0) } }));
    expect(seen).toEqual([[0, 60]]);
  });
  it('filtry: poziom, gvar <, areaKnown, areaNotKnown', () => {
    const r = [
      row({ chance: 1, narrator: 'lvl', minLevel: 10 }),
      row({ chance: 1, narrator: 'gv', gvar: 0, value: 3 }),
      row({ chance: 1, narrator: 'ak', areaKnown: 5 }),
      row({ chance: 1, narrator: 'ank', areaNotKnown: 6 }),
    ];
    // gvar 0 = 0 < 3 => 'gv' i 'ank' kwalifikuja sie (total=2), indeks absolutny 0 => 'lvl'
    expect(selectDeath(r, ctx({ rng: rng(1) }))?.narrator).toBe('lvl');
    // gvar = 3 => 'gv' odpada; level 10 + area 5 znany => lvl, ak, ank (total=3)
    const all = ctx({ level: 10, gvars: reg([3]), areaKnown: (a: number) => a === 5 });
    expect(selectDeath(r, { ...all, rng: rng(3) })?.narrator).toBe('ak');
    expect(selectDeath(r, { ...all, rng: rng(2) })?.narrator).toBe('gv');
  });
  it('cecha oryginalu: indeks absolutny, nie n-ty kwalifikujacy', () => {
    const r = [
      row({ chance: 10, narrator: 'x', minLevel: 99 }),
      row({ chance: 10, narrator: 'y' }),
      row({ chance: 10, narrator: 'z' }),
    ];
    // kwalifikuja sie y,z (total 20). roll 15 => cum: y=10 <15, z=20>=15 => index 1 => rows[1]='y'
    expect(selectDeath(r, ctx({ rng: rng(15) }))?.narrator).toBe('y');
    expect(selectDeath(r, ctx({ rng: rng(5) }))?.narrator).toBe('x');
  });
  it('Modoc: gvar 491 != 0 i reason 0 wymusza wiersz 12 bez losowania', () => {
    const r = Array.from({ length: 13 }, (_, i) => row({ chance: 5, narrator: `r${i}` }));
    const g = new GvarRegistry(
      Array.from({ length: 492 }, (_, i) => `G${i}`),
      new Array(492).fill(0),
    );
    g.set(491, 1);
    let called = 0;
    const s = selectDeath(r, ctx({ gvars: g, rng: { int: () => (called++, 0) } }));
    expect(s?.narrator).toBe('r12');
    expect(called).toBe(0);
    expect(selectDeath(r, ctx({ gvars: g, reason: 1, rng: rng(0) }))?.narrator).toBe('r0');
  });
  it('pusta tabela daje undefined', () => {
    expect(selectDeath([], ctx())).toBeUndefined();
  });
  it('deterministyczny dla tego samego rng', () => {
    const a = selectDeath(rows, ctx({ rng: rng(33) }));
    const b = selectDeath(rows, ctx({ rng: rng(33) }));
    expect(a).toBe(b);
  });
});
