import { describe, expect, it } from 'vitest';
import { Anim } from '@f2/engine-core';
import { animCuesFor } from './combat-anim';

describe('animCuesFor', () => {
  it('pudlo: atak + unik celu', () => {
    expect(animCuesFor({ kind: 'attack', attacker: 1, target: 2, hit: false, damage: 0 })).toEqual([
      { id: 1, anim: Anim.ThrowPunch },
      { id: 2, anim: Anim.Dodge },
    ]);
  });
  it('trafienie: atak + reakcja na obrazenia', () => {
    expect(
      animCuesFor({ kind: 'attack', attacker: 1, target: 2, hit: true, damage: 4 })[1],
    ).toEqual({
      id: 2,
      anim: Anim.HitFromFront,
    });
  });
  it('smierc: wariant ze zdarzenia po biezacym klipie', () => {
    expect(animCuesFor({ kind: 'death', id: 2, anim: 21 })).toEqual([
      { id: 2, anim: 21, queue: true },
    ]);
  });
  it('ruch i tury nie daja klipow', () => {
    expect(animCuesFor({ kind: 'move', id: 1, hex: 5 })).toEqual([]);
    expect(animCuesFor({ kind: 'turn', id: 1 })).toEqual([]);
  });
});
