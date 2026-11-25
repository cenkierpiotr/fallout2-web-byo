import { describe, expect, it } from 'vitest';
import { Rng } from '../rng.js';

describe('Rng', () => {
  it('test_rng_same_seed_same_sequence', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const sa = Array.from({ length: 20 }, () => a.int(0, 100));
    const sb = Array.from({ length: 20 }, () => b.int(0, 100));
    expect(sa).toEqual(sb);
  });

  it('test_rng_different_seed_differs', () => {
    const r1 = new Rng(1);
    const r2 = new Rng(2);
    expect(Array.from({ length: 10 }, () => r1.int(0, 1e6))).not.toEqual(
      Array.from({ length: 10 }, () => r2.int(0, 1e6)),
    );
  });

  it('test_rng_int_inclusive_range_and_swapped_bounds', () => {
    const r = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(3, 1));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('test_rng_next_in_unit_interval', () => {
    const r = new Rng(0);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
