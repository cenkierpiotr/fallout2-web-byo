// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { detectLayout } from '../../src/art/layout-mode';

function fakeWin(coarse: boolean, width: number): Window {
  return {
    innerWidth: width,
    matchMedia: (q: string) => ({ matches: q.includes('coarse') ? coarse : false }),
  } as unknown as Window;
}

describe('detectLayout', () => {
  it('detectLayout: coarse pointer => touch', () => {
    expect(detectLayout(fakeWin(true, 1920))).toBe('touch');
  });
  it('detectLayout: 1920 + fine => pc', () => {
    expect(detectLayout(fakeWin(false, 1920))).toBe('pc');
  });
  it('szerokosc <= 900 => touch', () => {
    expect(detectLayout(fakeWin(false, 900))).toBe('touch');
  });
});
