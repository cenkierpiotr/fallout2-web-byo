import { describe, expect, it } from 'vitest';
import { hexToTile, hexToWorld, worldToHex } from '@f2/engine-core';
import { roofAlphaFor, wallAlphaFor } from '../roof-layer.js';
import { mapWith, obj } from './helpers.js';
import type { MapTiles } from '@f2/formats';

function tilesWithBuilding(hex: number): { tiles: MapTiles; covering: number } {
  const p = hexToWorld(hex);
  const covering = hexToTile(worldToHex(p.x, p.y + 96));
  const roof = new Uint16Array(10000).fill(1);
  for (const d of [0, 1, 100, 101]) roof[covering + d] = 7; // budynek 2x2
  roof[covering + 5] = 9; // osobny dach obok
  return { tiles: { floor: new Uint16Array(10000), roof }, covering };
}

describe('roofAlphaFor', () => {
  it('gracz pod dachem ukrywa caly spojny dach budynku', () => {
    const hex = 20100;
    const { tiles, covering } = tilesWithBuilding(hex);
    const map = mapWith([], [tiles, null, null]);
    const player = obj({ hex });
    for (const d of [0, 1, 100, 101]) expect(roofAlphaFor(covering + d, player, map)).toBe(0);
    expect(roofAlphaFor(covering + 5, player, map)).toBe(1);
    expect(roofAlphaFor(0, player, map)).toBe(1);
  });

  it('gracz poza budynkiem: dach widoczny', () => {
    const { tiles, covering } = tilesWithBuilding(20100);
    const map = mapWith([], [tiles, null, null]);
    const player = obj({ hex: 5000 });
    expect(roofAlphaFor(covering, player, map)).toBe(1);
  });

  it('bez kafli poziomu zwraca 1', () => {
    expect(roofAlphaFor(5, obj(), mapWith([]))).toBe(1);
  });
});

describe('wallAlphaFor', () => {
  it('szklo (bit 17) jest polprzezroczyste', () => {
    const a = wallAlphaFor(obj({ flags: 0x20000 }), obj());
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
  });
  it('zwykla sciana i bit 15 sa nieprzezroczyste', () => {
    expect(wallAlphaFor(obj({ flags: 0 }), obj())).toBe(1);
    expect(wallAlphaFor(obj({ flags: 0x8000 }), obj())).toBe(1);
  });
});
