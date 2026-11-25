import { describe, expect, it } from 'vitest';
import { ambientLightForHour, solarScorcherReady } from '../src/light.js';

describe('ambientLightForHour', () => {
  it('noon is max', () => expect(ambientLightForHour(12, 0)).toBe(1));
  it('midnight is min', () => {
    expect(ambientLightForHour(0, 0)).toBeCloseTo(0.25, 5);
    expect(ambientLightForHour(0, 0)).toBeLessThan(ambientLightForHour(12, 0));
  });
  it('dawn interpolates linearly 05:00 -> 08:00', () => {
    expect(ambientLightForHour(5, 0)).toBeCloseTo(0.25, 5);
    expect(ambientLightForHour(6, 30)).toBeCloseTo(0.625, 5);
    expect(ambientLightForHour(8, 0)).toBe(1);
  });
  it('dusk interpolates 18:00 -> 21:00', () => {
    expect(ambientLightForHour(19, 30)).toBeCloseTo(0.625, 5);
    expect(ambientLightForHour(21, 0)).toBeCloseTo(0.25, 5);
  });
  it('monotonic within 0..1, wraps hours', () => {
    for (let m = 0; m < 1440; m++) {
      const v = ambientLightForHour(Math.floor(m / 60), m % 60);
      expect(v).toBeGreaterThanOrEqual(0.25);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(ambientLightForHour(24, 0)).toBeCloseTo(ambientLightForHour(0, 0), 8);
  });
});

describe('solarScorcherReady', () => {
  it('prog 0xf333 (scisle wiekszy)', () => {
    expect(solarScorcherReady(0xf333)).toBe(false);
    expect(solarScorcherReady(0xf334)).toBe(true);
    expect(solarScorcherReady(0x10000)).toBe(true);
  });
});
