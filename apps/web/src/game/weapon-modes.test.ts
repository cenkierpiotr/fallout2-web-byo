import { describe, expect, it } from 'vitest';
import type { GameObject } from '@f2/engine-core';
import type { Proto } from '@f2/formats';
import { weaponFromObject } from './combat-controller';

// data: [?, min, max, dtype, range, range2, ?, minSt, ap, ap2, ?, ?, rounds]
const wpn = (ext: number, data: number[]): GameObject =>
  ({
    id: 1,
    pid: 0x10,
    type: 0,
    inventory: [],
    extra: { kind: 'item', subtype: 3, flags: 0, raw: Int32Array.from([]) },
    proto: {
      kind: 'item',
      pid: 0x10,
      subtype: 3,
      flags: 0,
      extFlags: ext,
      data,
      fid: 0,
    } as unknown as Proto,
  }) as unknown as GameObject;
const D = [0, 5, 10, 0, 20, 8, 0, 1, 4, 6, 0, 0, 5];

describe('weaponFromObject: tryby ataku z extFlags', () => {
  it('tryb 1 pojedynczy (6), tryb 2 seria (7): drugi tryb z apCost2, zasiegiem data[5] i seria', () => {
    const w = weaponFromObject(wpn(0x76, D), () => 5, [], []);
    expect(w?.burst).toBe(1);
    expect(w?.apCost).toBe(4);
    expect(w?.apCost2).toBe(6);
    expect(w?.secondary).toEqual({ range: 8, burst: 5, cls: 4 });
  });
  it('seria tylko dla kodu 7 lub 8; bez drugiego trybu brak secondary', () => {
    const w = weaponFromObject(wpn(0x07, D), () => 5, [], []);
    expect(w?.burst).toBe(5);
    expect(w?.secondary).toBeUndefined();
  });
  it('extFlags = 0: fallback po zasiegu, brak drugiego trybu', () => {
    const w = weaponFromObject(wpn(0, D), () => 5, [], []);
    expect(w?.secondary).toBeUndefined();
    expect(w?.cls).toBe(4);
  });
  it('niepoprawny koszt AP drugiego trybu spada do kosztu glownego', () => {
    const w = weaponFromObject(
      wpn(0x76, [0, 5, 10, 0, 20, 0, 0, 1, 4, 0, 0, 0, 5]),
      () => 5,
      [],
      [],
    );
    expect(w?.apCost2).toBe(4);
    expect(w?.secondary?.range).toBe(20);
  });
});
