import { describe, expect, it } from 'vitest';
import {
  RollResult,
  criticalLevel,
  criticalMissLevel,
  lookupCritical,
  resolveCritical,
  CRITICAL_BETTER_CRITICALS_BONUS,
} from '../src/index.js';

describe('rzut na poziom krytyka (0x423eb4, D)', () => {
  const rows: [number, number, number][] = [
    [0, 0, 0],
    [20, 0, 0],
    [21, 0, 1],
    [45, 0, 1],
    [46, 0, 2],
    [70, 0, 2],
    [71, 0, 3],
    [90, 0, 3],
    [91, 0, 4],
    [100, 0, 4],
    [101, 0, 5],
    [30, CRITICAL_BETTER_CRITICALS_BONUS, 2],
  ];
  for (const [d, b, want] of rows)
    it(`d100=${d} bonus=${b} -> ${want}`, () => expect(criticalLevel(d, b)).toBe(want));
});

describe('krytyczne pudlo (0x4240dc, D: progi)', () => {
  it('t = d100 - (LK-5)*5, progi 21/51/76/96', () => {
    expect(criticalMissLevel(20, 5)).toBe(0);
    expect(criticalMissLevel(21, 5)).toBe(1);
    expect(criticalMissLevel(50, 5)).toBe(1);
    expect(criticalMissLevel(51, 5)).toBe(2);
    expect(criticalMissLevel(76, 5)).toBe(3);
    expect(criticalMissLevel(96, 5)).toBe(4);
    // LK 10: t = d100 - 25
    expect(criticalMissLevel(45, 10)).toBe(0);
    // LK 1: t = d100 + 20
    expect(criticalMissLevel(1, 1)).toBe(1);
  });
});

describe('tablica krytykow', () => {
  it('lookup NPC i gracza z rekordow', () => {
    expect(lookupCritical(0, 0, 0, false)).toEqual({
      dmgMult: 4,
      flags: 0,
      statCheck: -1,
      statMod: 0,
      failFlags: 0,
      msg: 5001,
      failMsg: 5000,
    });
    expect(lookupCritical(0, 0, 2, false)?.dmgMult).toBe(5);
    expect(lookupCritical(0, 0, 0, true)).toMatchObject({ dmgMult: 3, msg: 6500 });
  });
  it('poza zakresem -> undefined', () => {
    expect(lookupCritical(19, 0, 0, false)).toBeUndefined();
    expect(lookupCritical(0, 9, 0, false)).toBeUndefined();
    expect(lookupCritical(0, 0, 6, false)).toBeUndefined();
  });
  it('resolve bez testu statu: flagi, mnoznik, msg', () => {
    const e = lookupCritical(0, 0, 0, false)!;
    expect(resolveCritical(e, () => RollResult.Success)).toEqual({
      multiplier: 4,
      flags: 0,
      msgId: 5001,
      checked: false,
      failed: false,
    });
  });
  it('resolve z testem statu: zdany i niezdany (wynik <=1 = niezdany)', () => {
    const e = lookupCritical(0, 0, 1, false)!; // [4,2048,stat 2,mod 0,failFlags 1,5002,5003]
    const ok = resolveCritical(e, (stat, mod) => {
      expect([stat, mod]).toEqual([2, 0]);
      return RollResult.Success;
    });
    expect(ok).toMatchObject({ flags: 2048, msgId: 5002, checked: true, failed: false });
    const bad = resolveCritical(e, () => RollResult.Failure);
    expect(bad).toMatchObject({ flags: 2048 | 1, msgId: 5003, checked: true, failed: true });
    const crit = resolveCritical(e, () => RollResult.CriticalFailure);
    expect(crit.failed).toBe(true);
  });
});
