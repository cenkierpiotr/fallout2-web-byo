import { describe, expect, it } from 'vitest';
import { detectInputProfile, resolveProfile, toUiProfile } from '../src/input-profile.js';

describe('detectInputProfile (srodowisko: pointerCoarse, maxTouchPoints, width)', () => {
  it('coarse + dotyk + waski ekran -> touch', () => {
    expect(detectInputProfile({ pointerCoarse: true, maxTouchPoints: 5, width: 390 })).toBe(
      'touch',
    );
    expect(detectInputProfile({ pointerCoarse: true, maxTouchPoints: 5, width: 1023 })).toBe(
      'touch',
    );
  });
  it('precyzyjny wskaznik bez dotyku -> desktop', () => {
    expect(detectInputProfile({ pointerCoarse: false, maxTouchPoints: 0, width: 1920 })).toBe(
      'desktop',
    );
  });
  it('precyzyjny wskaznik + dotyk -> hybrid', () => {
    expect(detectInputProfile({ pointerCoarse: false, maxTouchPoints: 10, width: 1366 })).toBe(
      'hybrid',
    );
  });
  it('coarse bez dotyku (dziwne srodowisko) -> desktop', () => {
    expect(detectInputProfile({ pointerCoarse: true, maxTouchPoints: 0, width: 800 })).toBe(
      'desktop',
    );
  });
  it('coarse + dotyk + duzy ekran (tablet) -> hybrid', () => {
    expect(detectInputProfile({ pointerCoarse: true, maxTouchPoints: 5, width: 1280 })).toBe(
      'hybrid',
    );
  });
});

describe('resolveProfile / toUiProfile', () => {
  const env = { pointerCoarse: true, maxTouchPoints: 5, width: 390 };
  it('auto uzywa wykrytego', () => {
    expect(resolveProfile('auto', env)).toBe('touch');
  });
  it('reczny wybor wygrywa', () => {
    expect(resolveProfile('desktop', env)).toBe('desktop');
    expect(resolveProfile('hybrid', env)).toBe('hybrid');
  });
  it('hybrid mapuje sie na wyglad desktop z gestami', () => {
    expect(toUiProfile('hybrid')).toEqual({ profile: 'desktop', gestures: true });
    expect(toUiProfile('touch')).toEqual({ profile: 'touch', gestures: true });
    expect(toUiProfile('desktop')).toEqual({ profile: 'desktop', gestures: false });
  });
});
