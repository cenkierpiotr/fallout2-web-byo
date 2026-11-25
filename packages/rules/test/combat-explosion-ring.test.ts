import { describe, expect, it } from 'vitest';
import { EXPLOSION_MAX_RADIUS, explosionRingTiles } from '../src/index.js';

// Heks jako (q,r) zakodowany q*1000+r; kierunki obrotowe co 60 stopni.
const D: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [0, -1],
  [1, -1],
];
const enc = (q: number, r: number): number => (q + 500) * 1000 + (r + 500);
const dec = (h: number): [number, number] => [Math.floor(h / 1000) - 500, (h % 1000) - 500];
const neighbor = (h: number, d: number): number => {
  const [q, r] = dec(h);
  const [dq, dr] = D[d] as [number, number];
  return enc(q + dq, r + dr);
};

describe('kolejnosc kafli pierscieni eksplozji (0x423c10, D)', () => {
  it('pierscien 1: start = srodek + dir 0, potem kierunki 2,3,4,5,0 (6 kafli)', () => {
    const t = explosionRingTiles(enc(0, 0), 1, neighbor);
    expect(t.map(dec)).toEqual([
      [1, 0],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [0, -1],
      [1, -1],
    ]);
  });
  it('pierscien r ma 6r kafli: start + r krokow dir 2, r dir 3, r dir 4, r dir 5, r dir 0, r-1 dir 1', () => {
    const all = explosionRingTiles(enc(0, 0), EXPLOSION_MAX_RADIUS, neighbor);
    expect(all.length).toBe(6 + 12 + 18);
    expect(new Set(all).size).toBe(all.length);
    const ring2 = all.slice(6, 18).map(dec);
    expect(ring2[0]).toEqual([2, 0]);
    expect(ring2[1]).toEqual([1, 1]);
    expect(ring2[2]).toEqual([0, 2]);
    expect(ring2[11]).toEqual([2, -1]);
  });
  it('maxRadius ogranicza liczbe pierscieni; -1 z neighbor konczy', () => {
    expect(explosionRingTiles(enc(0, 0), 2, neighbor).length).toBe(18);
    expect(explosionRingTiles(enc(0, 0), 0, neighbor)).toEqual([]);
    const edge = (h: number, d: number): number => (d === 0 ? -1 : neighbor(h, d));
    expect(explosionRingTiles(enc(0, 0), 3, edge)).toEqual([]);
  });
});
