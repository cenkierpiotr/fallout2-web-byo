import { describe, expect, it } from 'vitest';
import { SpriteBatch } from './sprite-batch.js';
import type { IndexedTexture } from './gfx-device.js';

const a: IndexedTexture = { id: 1, width: 64, height: 32 };
const b: IndexedTexture = { id: 2, width: 16, height: 16 };

describe('SpriteBatch', () => {
  it('grupuje po teksturze w kolejnosci pierwszego wystapienia', () => {
    const batch = new SpriteBatch();
    batch.push({ texture: a, sx: 8, sy: 4, sw: 10, sh: 10, x: 100, y: 200 });
    batch.push({ texture: b, sx: 0, sy: 0, sw: 16, sh: 16, x: 0, y: 0 });
    batch.push({ texture: a, sx: 0, sy: 0, sw: 8, sh: 8, x: 1, y: 2 });
    expect(batch.count).toBe(3);
    const g = batch.groups();
    expect(g.length).toBe(2);
    expect(g[0]!.texture).toBe(a);
    expect(g[0]!.vertices.length).toBe(32);
    expect(g[0]!.spriteCount).toBe(2);
    expect(g[1]!.vertices.length).toBe(16);
    const v = g[0]!.vertices;
    // wierzcholki quada: (x0,y0) (x1,y0) (x0,y1) (x1,y1)
    expect([v[0], v[1]]).toEqual([100, 200]);
    expect([v[2], v[3]]).toEqual([8 / 64, 4 / 32]);
    expect([v[12], v[13]]).toEqual([110, 210]);
    expect([v[14], v[15]]).toEqual([18 / 64, 14 / 32]);
    expect(g[0]!.area).toBe(100 + 64);
  });
  it('uzywa dw/dh i pushRect rowna sie push', () => {
    const x = new SpriteBatch();
    const y = new SpriteBatch();
    x.push({ texture: a, sx: 2, sy: 3, sw: 10, sh: 10, x: 5, y: 6, dw: 4, dh: 3 });
    y.pushRect(a, 2, 3, 10, 10, 5, 6, 4, 3);
    expect(Array.from(x.groups()[0]!.vertices)).toEqual(Array.from(y.groups()[0]!.vertices));
    expect(x.groups()[0]!.vertices[4]).toBe(9);
    expect(x.groups()[0]!.vertices[13]).toBe(9);
  });
  it('rosnie powyzej poczatkowej pojemnosci i zachowuje dane', () => {
    const batch = new SpriteBatch();
    for (let i = 0; i < 1000; i++) batch.pushRect(a, 0, 0, 1, 1, i, 0, 1, 1);
    const g = batch.groups()[0]!;
    expect(g.spriteCount).toBe(1000);
    expect(g.vertices[999 * 16]).toBe(999);
    expect(g.vertices[0]).toBe(0);
  });
  it('po clear kolejnosc grup liczy sie od nowa, bez wyciekow miedzy klatkami', () => {
    const batch = new SpriteBatch();
    batch.pushRect(a, 0, 0, 1, 1, 0, 0, 1, 1);
    batch.pushRect(b, 0, 0, 1, 1, 0, 0, 1, 1);
    batch.clear();
    batch.pushRect(b, 0, 0, 1, 1, 0, 0, 1, 1);
    const g = batch.groups();
    expect(g.length).toBe(1);
    expect(g[0]!.texture).toBe(b);
    expect(batch.count).toBe(1);
  });
  it('clear zeruje', () => {
    const batch = new SpriteBatch();
    batch.push({ texture: a, sx: 0, sy: 0, sw: 1, sh: 1, x: 0, y: 0 });
    batch.clear();
    expect(batch.count).toBe(0);
    expect(batch.groups()).toEqual([]);
  });
});
