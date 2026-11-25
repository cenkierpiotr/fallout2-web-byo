import { describe, expect, it } from 'vitest';
import {
  activatedExplosivePid,
  explosiveDamageRange,
  explosiveFuse,
  isExplosivePid,
  EXPLOSION_MAX_RADIUS,
} from '../src/index.js';

describe('ladunki wybuchowe (D: silnik gry 0x4a2828, 0x49bcb4)', () => {
  it('obrazenia: dynamit 30-50, plastik 40-80, Demolition Expert +10', () => {
    expect(explosiveDamageRange(0x33, false)).toEqual({ min: 30, max: 50 });
    expect(explosiveDamageRange(0xce, false)).toEqual({ min: 30, max: 50 });
    expect(explosiveDamageRange(0x55, false)).toEqual({ min: 40, max: 80 });
    expect(explosiveDamageRange(0xd1, true)).toEqual({ min: 50, max: 90 });
    expect(explosiveDamageRange(0x31, false)).toBeNull();
  });
  it('pid po ustawieniu i rozpoznawanie ladunkow', () => {
    expect(activatedExplosivePid(0x33)).toBe(0xce);
    expect(activatedExplosivePid(0x55)).toBe(0xd1);
    expect(activatedExplosivePid(0xd1)).toBe(0xd1);
    expect(isExplosivePid(0x55)).toBe(true);
    expect(isExplosivePid(0x31)).toBe(false);
    expect(EXPLOSION_MAX_RADIUS).toBe(3);
  });
  it('zapalnik: rzut Traps i perk Demolition Expert', () => {
    expect(explosiveFuse(10, 2, false)).toEqual({ kind: 'explosion', delayTicks: 100 });
    expect(explosiveFuse(10, 3, false)).toEqual({ kind: 'explosion', delayTicks: 100 });
    expect(explosiveFuse(10, 1, false)).toEqual({ kind: 'misfire', delayTicks: 50 });
    expect(explosiveFuse(10, 0, false)).toEqual({ kind: 'misfire', delayTicks: 100 });
    expect(explosiveFuse(10, 0, true)).toEqual({ kind: 'explosion', delayTicks: 100 });
  });
});
