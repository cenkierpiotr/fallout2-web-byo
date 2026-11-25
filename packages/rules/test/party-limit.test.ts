import { describe, expect, it } from 'vitest';
import { canRecruit, partyLimit } from '../src/index.js';

describe('partyLimit (Z: formula ze skryptow, nie z exe)', () => {
  it('Charyzma / 2 w dol', () => {
    expect(partyLimit(4, false)).toBe(2);
    expect(partyLimit(5, false)).toBe(2);
    expect(partyLimit(6, false)).toBe(3);
    expect(partyLimit(1, false)).toBe(0);
  });
  it('Magnetic Personality +1', () => {
    expect(partyLimit(4, true)).toBe(3);
    expect(partyLimit(6, true)).toBe(4);
  });
  it('wartosci spoza 1..10 i NaN: obciete', () => {
    expect(partyLimit(-3, false)).toBe(0);
    expect(partyLimit(99, false)).toBe(5);
    expect(partyLimit(Number.NaN, false)).toBe(0);
  });
});

describe('canRecruit', () => {
  it('false przy pelnej druzynie, true gdy jest miejsce', () => {
    expect(canRecruit(2, 2)).toBe(false);
    expect(canRecruit(2, 1)).toBe(true);
    expect(canRecruit(0, 0)).toBe(false);
  });
});
