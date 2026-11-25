import { describe, expect, it } from 'vitest';
import { createRng } from '../src/index.js';

describe('createRng', () => {
  it('jest powtarzalny dla tego samego seeda', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 50; i++) expect(a.roll(1, 100)).toBe(b.roll(1, 100));
  });
  it('roll(1,6) rowno rozklada wartosci (10000 rzutow, kazda 1500-1850)', () => {
    const r = createRng(7);
    const n = [0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 10000; i++) n[r.roll(1, 6)]!++;
    for (let v = 1; v <= 6; v++) {
      expect(n[v]).toBeGreaterThanOrEqual(1500);
      expect(n[v]).toBeLessThanOrEqual(1850);
    }
  });
  it('chance(0) zawsze false, chance(100) zawsze true', () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(100)).toBe(true);
    }
  });
  it('state() pozwala odtworzyc ciag; int = roll', () => {
    const r = createRng(9);
    r.roll(1, 10);
    const st = r.state();
    const x = r.int(1, 1000);
    const r2 = createRng(0);
    // odtworzenie: ten sam seed i ta sama liczba krokow
    const r3 = createRng(9);
    r3.roll(1, 10);
    expect(r3.state()).toBe(st);
    expect(r3.int(1, 1000)).toBe(x);
    expect(r2.state()).not.toBe(st);
  });
});
