import { describe, expect, it } from 'vitest';
import { detectProfile } from '../input-profile.js';

describe('detectProfile', () => {
  it('test_detectProfile_coarse_touch_small_is_touch', () => {
    expect(detectProfile({ coarsePointer: true, maxTouchPoints: 5, width: 390 })).toBe('touch');
  });
  it('test_detectProfile_laptop_touch_is_hybrid', () => {
    expect(detectProfile({ coarsePointer: false, maxTouchPoints: 10, width: 1920 })).toBe('hybrid');
  });
  it('desktop bez dotyku', () => {
    expect(detectProfile({ coarsePointer: false, maxTouchPoints: 0, width: 1920 })).toBe('desktop');
  });
  it('tablet duzy z grubym wskaznikiem = hybrid', () => {
    expect(detectProfile({ coarsePointer: true, maxTouchPoints: 5, width: 1180 })).toBe('hybrid');
  });
});
