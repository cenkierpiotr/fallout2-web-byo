import { describe, expect, it } from 'vitest';
import { hexToWorld, makeHex } from '@f2/engine-core';
import {
  tileCompareSlopeA,
  tileCompareSlopeB,
  wallCutout,
  type CutoutInput,
} from '../wall-cutout.js';

const player = makeHex(100, 100);

function base(over: Partial<CutoutInput>): CutoutInput {
  return {
    objType: 3,
    objHex: makeHex(100, 101),
    objFlags: 0,
    protoExtFlags: 0,
    playerHex: player,
    playerFlags: 0,
    ...over,
  };
}

describe('f2_tile_compare_slope (0x4b1994 / 0x4b1a00)', () => {
  it('liczy (xB-xA) <= (yB-yA)*C na pikselach', () => {
    const a = makeHex(100, 100);
    const b = makeHex(100, 101);
    const pa = hexToWorld(a);
    const pb = hexToWorld(b);
    expect(tileCompareSlopeA(a, b)).toBe(pb.x - pa.x <= (pb.y - pa.y) * -4);
    expect(tileCompareSlopeB(a, b)).toBe(pb.x - pa.x <= (pb.y - pa.y) * (4 / 3));
  });
  it('rownosc daje 1 (<=)', () => {
    expect(tileCompareSlopeA(player, player)).toBe(true);
    expect(tileCompareSlopeB(player, player)).toBe(true);
  });
});

describe('wallCutout (0x48f3f2)', () => {
  it('tylko scenery i wall', () => {
    expect(wallCutout(base({ objType: 1, objHex: player }))).toBe(false);
    expect(wallCutout(base({ objType: 3, objHex: player }))).toBe(true);
    expect(wallCutout(base({ objType: 2, objHex: player }))).toBe(true);
  });
  it('ukryty gracz lub flagi przezroczystosci wylaczaja', () => {
    expect(wallCutout(base({ objHex: player, playerFlags: 1 }))).toBe(false);
    expect(wallCutout(base({ objHex: player, objFlags: 0x8000 }))).toBe(false);
  });
  it('flaga 0x10000000 obiektu wylacza w galeziach domyslnej i 0x8000000, ale nie 0x10000000/0x20000000', () => {
    const o = { objHex: player, objFlags: 0x10000000 };
    expect(wallCutout(base({ ...o }))).toBe(false);
    expect(wallCutout(base({ ...o, protoExtFlags: 0x8000000 }))).toBe(false);
    expect(wallCutout(base({ ...o, protoExtFlags: 0x80000000 }))).toBe(false);
    expect(wallCutout(base({ ...o, protoExtFlags: 0x10000000 }))).toBe(true);
    expect(wallCutout(base({ ...o, protoExtFlags: 0x20000000 }))).toBe(true);
  });
  it('kombinacje porownan zgodne z asemblerem', () => {
    const hexes = [makeHex(100, 99), makeHex(98, 100), makeHex(102, 101), makeHex(100, 103)];
    for (const w of hexes) {
      const A = tileCompareSlopeA(w, player);
      const BwH = tileCompareSlopeB(w, player);
      const BhW = tileCompareSlopeB(player, w);
      const AhW = tileCompareSlopeA(player, w);
      expect(wallCutout(base({ objHex: w, protoExtFlags: 0x8000000 }))).toBe(A && BwH);
      expect(wallCutout(base({ objHex: w, protoExtFlags: 0x10000000 }))).toBe(A || BhW);
      expect(wallCutout(base({ objHex: w, protoExtFlags: 0x20000000 }))).toBe(A && BhW);
      expect(wallCutout(base({ objHex: w }))).toBe(BhW && AhW);
    }
  });
});
