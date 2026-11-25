import { describe, expect, it } from 'vitest';
import { maxHpOf } from './pipboy-view';

describe('maxHpOf', () => {
  it('liczy 15 + ST + 2*EN', () => {
    expect(maxHpOf([6, 5, 7])).toBe(35);
  });
});
