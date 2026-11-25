import { describe, expect, it } from 'vitest';
import { detectInputProfile } from './profile.js';

describe('detectInputProfile', () => {
  it('touch', () => {
    expect(detectInputProfile({ coarse: true, hover: false, maxTouchPoints: 5, width: 390 })).toBe(
      'touch',
    );
  });
  it('hybrid', () => {
    expect(
      detectInputProfile({ coarse: false, hover: true, maxTouchPoints: 10, width: 1280 }),
    ).toBe('hybrid');
  });
  it('desktop', () => {
    expect(detectInputProfile({ coarse: false, hover: true, maxTouchPoints: 0, width: 1280 })).toBe(
      'desktop',
    );
  });
});
