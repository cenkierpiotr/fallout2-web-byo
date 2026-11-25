import { describe, expect, it } from 'vitest';
import { ambientWithNightVision, runAllowedUnderLoad } from './map-loop-rules';

describe('ambientWithNightVision (D 0x47a908)', () => {
  it('ranga 0 nie zmienia swiatla, takze ponizej 0x4000', () => {
    expect(ambientWithNightVision(0.1, 0)).toBe(0.1);
  });
  it('kazda ranga dodaje 0x3333 w skali 0x10000', () => {
    expect(ambientWithNightVision(0.5, 1)).toBeCloseTo(0.5 + 0x3333 / 0x10000, 6);
    expect(ambientWithNightVision(0.5, 2)).toBeCloseTo(0.5 + (2 * 0x3333) / 0x10000, 6);
  });
  it('przycina do 1 od gory', () => {
    expect(ambientWithNightVision(0.95, 3)).toBe(1);
  });
  it('podnosi ciemnosc do dolnego progu 0x4000 (0.25)', () => {
    expect(ambientWithNightVision(0, 1)).toBeCloseTo(0.25, 6);
  });
});

describe('runAllowedUnderLoad (D 0x42e66c)', () => {
  it('bez proby biegu zawsze false', () => {
    expect(runAllowedUnderLoad(false, { carryMax: 100, carried: 10 })).toBe(false);
  });
  it('w granicach udzwigu bieg dozwolony, takze przy rownosci', () => {
    expect(runAllowedUnderLoad(true, { carryMax: 100, carried: 99 })).toBe(true);
    expect(runAllowedUnderLoad(true, { carryMax: 100, carried: 100 })).toBe(true);
  });
  it('ponad udzwigiem bieg zamienia sie w chod', () => {
    expect(runAllowedUnderLoad(true, { carryMax: 100, carried: 101 })).toBe(false);
  });
  it('brak sesji nie ogranicza biegu', () => {
    expect(runAllowedUnderLoad(true, undefined)).toBe(true);
  });
});
