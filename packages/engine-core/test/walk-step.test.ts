import { describe, expect, it } from 'vitest';
import { walkStepReached, walkStepRemainder } from '../src/walk-step.js';

describe('walk-step (0x417360)', () => {
  it('kierunek 1 (dx=32): krok dopiero przy offsecie x >= 32', () => {
    expect(walkStepReached(1, 31, 0)).toBe(false);
    expect(walkStepReached(1, 32, 0)).toBe(true);
  });
  it('kierunek 4 (dx=-32): krok przy offsecie x <= -32', () => {
    expect(walkStepReached(4, -31, 0)).toBe(false);
    expect(walkStepReached(4, -32, 0)).toBe(true);
  });
  it('kierunek 0 (dx=16, dy=-12): wystarczy osiagniecie jednej osi', () => {
    expect(walkStepReached(0, 0, -12)).toBe(true);
    expect(walkStepReached(0, 16, 0)).toBe(true);
    expect(walkStepReached(0, 15, -11)).toBe(false);
  });
  it('po kroku offset pomniejszony o delte', () => {
    expect(walkStepRemainder(2, 18, 13)).toEqual({ x: 2, y: 1 });
  });
  it('nieznany kierunek: brak kroku', () => {
    expect(walkStepReached(9, 99, 99)).toBe(false);
  });
});
