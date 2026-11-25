import { describe, expect, it } from 'vitest';
import { SpriteBatch } from './sprite-batch.js';
import type { IndexedTexture } from './gfx-device.js';
import { premultiplyRgba } from './hd-rgba.js';

const idx: IndexedTexture = { id: 1, width: 64, height: 64 };
const hd: IndexedTexture = { id: 2, width: 256, height: 256, rgba: true };
const hdLin: IndexedTexture = { id: 3, width: 256, height: 256, rgba: true, linear: true };

describe('SpriteBatch: tryb kolejnosciowy (HD RGBA)', () => {
  it('domyslnie wylaczony: grupy po teksturze (bez zmian)', () => {
    const b = new SpriteBatch();
    expect(b.ordered).toBe(false);
    b.pushRect(idx, 0, 0, 8, 8, 0, 0, 8, 8);
    b.pushRect(hd, 0, 0, 32, 32, 0, 0, 8, 8);
    b.pushRect(idx, 0, 0, 8, 8, 9, 0, 8, 8);
    expect(b.groups().map((g) => [g.texture.id, g.spriteCount])).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });
  it("ordered: serie kolejnych sprite'ow, kolejnosc rysowania zachowana", () => {
    const b = new SpriteBatch();
    b.ordered = true;
    b.pushRect(idx, 0, 0, 8, 8, 0, 0, 8, 8);
    b.pushRect(idx, 0, 0, 8, 8, 1, 0, 8, 8);
    b.pushRect(hd, 0, 0, 32, 32, 0, 0, 8, 8);
    b.pushRect(idx, 0, 0, 8, 8, 9, 0, 8, 8);
    expect(b.count).toBe(4);
    expect(b.groups().map((g) => [g.texture.id, g.spriteCount])).toEqual([
      [1, 2],
      [2, 1],
      [1, 1],
    ]);
    // po clear i ponownym uzyciu: bez wyciekow miedzy klatkami
    b.clear();
    b.pushRect(hd, 0, 0, 32, 32, 0, 0, 8, 8);
    expect(b.groups().map((g) => [g.texture.id, g.spriteCount])).toEqual([[2, 1]]);
    expect(b.count).toBe(1);
  });
  it('ordered z jedna tekstura daje te same wierzcholki co tryb domyslny', () => {
    const run = (ordered: boolean) => {
      const b = new SpriteBatch();
      b.ordered = ordered;
      b.pushRect(idx, 4, 4, 10, 10, 100, 50, 10, 10, 0.5);
      b.pushRect(idx, 0, 0, 8, 8, 1, 2, 8, 8, 1);
      return b.groups().map((g) => [Array.from(g.vertices), Array.from(g.lights)]);
    };
    expect(run(true)).toEqual(run(false));
  });
  it('linear: UV cofniete o pol teksela, bez linear bez zmian', () => {
    const b = new SpriteBatch();
    b.pushRect(hdLin, 0, 0, 128, 128, 0, 0, 32, 32);
    b.pushRect(hd, 0, 0, 128, 128, 0, 0, 32, 32);
    const [g1, g2] = b.groups();
    expect(g1!.vertices[2]).toBeCloseTo(0.5 / 256);
    expect(g1!.vertices[14]).toBeCloseTo(127.5 / 256);
    expect(g2!.vertices[2]).toBe(0);
    expect(g2!.vertices[14]).toBe(0.5);
  });
});

describe('premultiplyRgba', () => {
  it('mnozy RGB przez alfe, alfa bez zmian', () => {
    const out = premultiplyRgba(
      new Uint8Array([200, 100, 50, 128, 255, 255, 255, 0, 10, 20, 30, 255]),
    );
    expect(Array.from(out)).toEqual([100, 50, 25, 128, 0, 0, 0, 0, 10, 20, 30, 255]);
  });
});
