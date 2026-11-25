import { describe, expect, it } from 'vitest';
import { HdOverride, selectSprite, type DirectoryHandleLike } from '../hd-override.js';
import type { SpriteHandle } from '../sprite-cache.js';

function fakeDir(files: Record<string, string | Record<string, string>>): DirectoryHandleLike {
  return {
    async getFileHandle(n) {
      const v = files[n];
      if (typeof v !== 'string') throw new Error('nf');
      return {
        getFile: async () => ({ text: async () => v, arrayBuffer: async () => new ArrayBuffer(4) }),
      };
    },
    async getDirectoryHandle(n) {
      const v = files[n];
      if (!v || typeof v === 'string') throw new Error('nf');
      return fakeDir(v);
    },
  };
}

const entry = (frm: string, source: string, approved: boolean) => ({
  source,
  frm,
  scale: 4,
  atlas: 'atlas-0000.png',
  approved,
  frames: [{ dir: 0, frame: 0, rect: [8, 4, 320, 144], offX: 16, offY: 32 }],
});
const manifest = JSON.stringify({
  version: 1,
  generatedAt: '',
  entries: {
    'art/tiles/a.frm': entry('art/tiles/a.frm', 'xbrz', false),
    'art/critters/b.frm': entry('art/critters/b.frm', 'gemini', false),
    'art/critters/c.frm': entry('art/critters/c.frm', 'gemini', true),
  },
});
const root = () =>
  fakeDir({
    'manifest.json': manifest,
    base: { 'atlas-0000.png': 'x' },
    hd: { 'atlas-0000.png': 'x' },
  });
let loads = 0;
const mk = async (dir: DirectoryHandleLike | null = root()) => {
  const h = new HdOverride(dir, {
    loadAtlas: async () => ({ id: ++loads, width: 4096, height: 4096 }),
  });
  await h.load();
  return h;
};
const baseHandle: SpriteHandle = {
  fps: 8,
  actionFrame: 2,
  framesPerDirection: 1,
  directions: [
    [
      {
        texture: { id: 0, width: 1, height: 1 },
        sx: 0,
        sy: 0,
        width: 80,
        height: 36,
        offsetX: 4,
        offsetY: 8,
      },
    ],
  ],
  shiftX: new Int16Array([3]),
  shiftY: new Int16Array([-2]),
};

describe('HdOverride', () => {
  it('test_hdOverride_mode_original_never_overrides', async () => {
    const h = await mk();
    expect(h.mode.value).toBe('original');
    expect(h.has('art/tiles/a.frm')).toBe(false);
    expect(await h.getSprite('art/tiles/a.frm')).toBeNull();
  });
  it('test_hdOverride_base_uses_manifest_entry_scale4', async () => {
    const h = await mk();
    h.mode.value = 'base';
    const s = (await h.getSprite('ART/tiles/a.frm', baseHandle))!;
    const f = s.directions[0]![0]!;
    expect(f.scale).toBe(4);
    expect([f.sx, f.sy, f.width, f.height, f.offsetX, f.offsetY]).toEqual([8, 4, 320, 144, 16, 32]);
    expect(s.shiftX[0]).toBe(12);
    expect(s.shiftY[0]).toBe(-8);
    expect(s.fps).toBe(8);
  });
  it('test_hdOverride_missing_entry_falls_back_to_frm', async () => {
    const h = await mk();
    h.mode.value = 'hd';
    expect(await selectSprite('art/x.frm', async () => baseHandle, h)).toBe(baseHandle);
    const none = await mk(null);
    none.mode.value = 'hd';
    expect(await selectSprite('art/tiles/a.frm', async () => baseHandle, none)).toBe(baseHandle);
    const broken = await mk(fakeDir({}));
    broken.mode.value = 'base';
    expect(broken.has('art/tiles/a.frm')).toBe(false);
  });
  it('test_hdOverride_unapproved_entry_skipped_in_hd_mode_but_used_in_base_when_source_xbrz', async () => {
    const h = await mk();
    h.mode.value = 'hd';
    expect(h.has('art/tiles/a.frm')).toBe(false);
    expect(h.has('art/critters/b.frm')).toBe(false);
    expect(h.has('art/critters/c.frm')).toBe(true);
    h.mode.value = 'base';
    expect(h.has('art/tiles/a.frm')).toBe(true);
    expect(h.has('art/critters/b.frm')).toBe(false);
  });
  it('LRU atlasow: wyrzuca najstarszy ponad limit', async () => {
    const evicted: number[] = [];
    const files = (n: string) => ({
      source: 'xbrz',
      frm: n,
      scale: 4,
      atlas: n + '.png',
      approved: false,
      frames: [{ dir: 0, frame: 0, rect: [0, 0, 4, 4], offX: 0, offY: 0 }],
    });
    const dir = fakeDir({
      'manifest.json': JSON.stringify({
        version: 1,
        generatedAt: '',
        entries: { a: files('a'), b: files('b') },
      }),
      base: { 'a.png': 'x', 'b.png': 'x' },
    });
    let id = 0;
    const h = new HdOverride(dir, {
      maxAtlases: 1,
      loadAtlas: async () => ({ id: ++id, width: 8, height: 8 }),
      onEvict: (t) => evicted.push(t.id),
    });
    await h.load();
    h.mode.value = 'base';
    await h.getSprite('a');
    await h.getSprite('b');
    await Promise.resolve();
    await Promise.resolve();
    expect(evicted).toEqual([1]);
  });
});
