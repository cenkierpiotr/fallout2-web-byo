import { describe, expect, it } from 'vitest';
import { HdOverride, selectSprite, type DirectoryHandleLike } from '../hd-override.js';
import type { SpriteHandle } from '../sprite-cache.js';

const dirOf = (files: Record<string, unknown>, broken = false): DirectoryHandleLike => ({
  async getFileHandle(n) {
    const v = files[n];
    if (typeof v !== 'string') throw new Error('nf');
    return {
      getFile: async () => ({ text: async () => v, arrayBuffer: async () => new ArrayBuffer(4) }),
    };
  },
  async getDirectoryHandle(n) {
    if (broken) throw new Error('boom');
    return dirOf((files[n] ?? {}) as Record<string, unknown>);
  },
});
const frames = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    dir: 0,
    frame: i,
    rect: [i * 8, 0, 8, 8],
    offX: 0,
    offY: 0,
  }));
const manifest = JSON.stringify({
  version: 1,
  generatedAt: '',
  entries: {
    'art/tiles/t.frm': {
      source: 'gemini',
      frm: 't',
      scale: 4,
      atlas: 'x.png',
      approved: true,
      frames: frames(1),
    },
    'art/critters/a.frm': {
      source: 'gemini',
      frm: 'a',
      scale: 4,
      atlas: 'x.png',
      approved: true,
      frames: frames(2),
    },
  },
});
const crit6 = (dup = false) =>
  Array.from({ length: 6 }, (_, d) =>
    Array.from({ length: 2 }, (_, i) => ({
      dir: dup && d === 5 && i === 1 ? 0 : d,
      frame: dup && d === 5 && i === 1 ? 0 : i,
      rect: [(d * 2 + i) * 8, 0, 8 + d, 8],
      offX: d,
      offY: 0,
    })),
  ).flat();
const manifest6 = (dup = false) =>
  JSON.stringify({
    version: 1,
    generatedAt: '',
    entries: {
      'art/critters/six.frm': {
        source: 'flux',
        frm: 'six',
        scale: 4,
        atlas: 'x.png',
        approved: true,
        frames: crit6(dup),
      },
    },
  });
const mk6 = async (dup = false) => {
  const h = new HdOverride(dirOf({ 'manifest.json': manifest6(dup), hd: { 'x.png': 'p' } }), {
    loadAtlas: async () => ({ id: 9, width: 256, height: 8, rgba: true }),
  });
  await h.load();
  h.mode.value = 'hd';
  return h;
};
const base = (perDir: number): SpriteHandle => ({
  fps: 10,
  actionFrame: 0,
  framesPerDirection: perDir,
  directions: [
    Array.from({ length: perDir }, () => ({
      texture: { id: 0, width: 1, height: 1 },
      sx: 0,
      sy: 0,
      width: 2,
      height: 2,
      offsetX: 0,
      offsetY: 0,
    })),
  ],
  shiftX: new Int16Array(perDir),
  shiftY: new Int16Array(perDir),
});
const mk = async (broken = false) => {
  const h = new HdOverride(dirOf({ 'manifest.json': manifest, hd: { 'x.png': 'p' } }, broken), {
    loadAtlas: async () => ({ id: 9, width: 64, height: 8, rgba: true }),
  });
  await h.load();
  h.mode.value = 'hd';
  return h;
};

describe('HdOverride: bezpieczny fallback per asset', () => {
  it('liczba klatek zgodna z oryginalem: HD', async () => {
    const s = await selectSprite('art/critters/a.frm', async () => base(2), await mk());
    expect(s.directions[0]![0]!.scale).toBe(4);
  });
  it('niekompletny HD (inna liczba klatek): oryginal', async () => {
    const b = base(3);
    expect(await selectSprite('art/critters/a.frm', async () => b, await mk())).toBe(b);
  });
  it('blad ladowania atlasu: oryginal, bez wyjatku', async () => {
    const b = base(2);
    expect(await selectSprite('art/critters/a.frm', async () => b, await mk(true))).toBe(b);
  });
  it('wpis HD z 1 kierunkiem dla kafla z 6 identycznymi kierunkami: powielony', async () => {
    const one = base(1).directions[0]!;
    const b: SpriteHandle = {
      ...base(1),
      directions: Array.from({ length: 6 }, () => one.map((f) => ({ ...f }))),
    };
    const s = await selectSprite('art/tiles/t.frm', async () => b, await mk());
    expect(s.directions).toHaveLength(6);
    expect(s.directions[5]![0]!.scale).toBe(4);
  });
  it('1 kierunek HD a rozne kierunki oryginalu: oryginal', async () => {
    const one = base(1).directions[0]!;
    const b: SpriteHandle = {
      ...base(1),
      directions: Array.from({ length: 6 }, (_, i) => one.map((f) => ({ ...f, width: 2 + i }))),
    };
    expect(await selectSprite('art/tiles/t.frm', async () => b, await mk())).toBe(b);
  });
  it('krytter z 1 kierunkiem HD: nigdy nie powielany', async () => {
    const one = base(2).directions[0]!;
    const b: SpriteHandle = {
      ...base(2),
      directions: Array.from({ length: 6 }, () => one.map((f) => ({ ...f }))),
    };
    expect(await selectSprite('art/critters/a.frm', async () => b, await mk())).toBe(b);
  });
  it('krytter z 6 kierunkami HD: kazdy kierunek ma wlasne klatki, bez powielania', async () => {
    const one = base(2).directions[0]!;
    const b: SpriteHandle = {
      ...base(2),
      directions: Array.from({ length: 6 }, () => one.map((f) => ({ ...f }))),
      shiftX: new Int16Array(6),
      shiftY: new Int16Array(6),
    };
    const s = await selectSprite('art/critters/six.frm', async () => b, await mk6());
    expect(s).not.toBe(b);
    expect(s.directions).toHaveLength(6);
    for (let d = 0; d < 6; d++) {
      expect(s.directions[d]).toHaveLength(2);
      expect(s.directions[d]![0]!.width).toBe(8 + d);
      expect(s.directions[d]![1]!.sx).toBe((d * 2 + 1) * 8);
      expect(s.directions[d]![0]!.offsetX).toBe(d);
    }
    expect(s.directions[1]).not.toBe(s.directions[0]);
  });
  it('krytter: powtorzona para dir/frame (dziura) mimo zgodnej liczby klatek: oryginal', async () => {
    const one = base(2).directions[0]!;
    const b: SpriteHandle = {
      ...base(2),
      directions: Array.from({ length: 6 }, () => one.map((f) => ({ ...f }))),
      shiftX: new Int16Array(6),
      shiftY: new Int16Array(6),
    };
    expect(await selectSprite('art/critters/six.frm', async () => b, await mk6(true))).toBe(b);
  });
});
