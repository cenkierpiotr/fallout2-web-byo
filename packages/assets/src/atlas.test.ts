import { describe, expect, it } from 'vitest';
import { ShelfPacker } from './atlas.js';

describe('ShelfPacker', () => {
  it('pakuje na polkach z paddingiem 1 px', () => {
    const p = new ShelfPacker(9, 8);
    expect(p.insert(4, 4)).toEqual({ x: 0, y: 0 });
    expect(p.insert(4, 4)).toEqual({ x: 5, y: 0 });
    expect(p.insert(10, 1)).toBeNull();
  });
  it('przechodzi na nowa polke i zwraca null gdy brak miejsca', () => {
    const p = new ShelfPacker(9, 8);
    p.insert(4, 4);
    p.insert(4, 4);
    expect(p.insert(4, 3)).toEqual({ x: 0, y: 5 });
    expect(p.insert(4, 4)).toBeNull();
  });
});
