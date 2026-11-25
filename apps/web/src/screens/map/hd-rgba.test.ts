import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../settings';
import type { GfxDevice } from '@f2/render';
import { createHd, planHd, vfsDirectoryHandle, type HdFileReader } from './hd-rgba';
import { SpriteLibrary } from './sprite-library';
import type { SpriteCache, SpriteHandle } from '@f2/assets';
import type { GameObject } from '@f2/engine-core';
import type { FidResolver } from './fid-path';
import { HdOverride } from '@f2/assets';

const enc = (s: string) => new TextEncoder().encode(s);
const manifest = JSON.stringify({
  version: 1,
  generatedAt: '',
  entries: {
    'art/critters/hmjmps.frm': {
      source: 'gemini',
      frm: 'x',
      scale: 4,
      atlas: 'a.png',
      approved: true,
      frames: [{ dir: 0, frame: 0, rect: [0, 0, 128, 256], offX: 8, offY: -4 }],
    },
    'art/tiles/t.frm': {
      source: 'xbrz',
      frm: 'x',
      scale: 4,
      atlas: 'a.png',
      approved: false,
      frames: [{ dir: 0, frame: 0, rect: [0, 0, 320, 144], offX: 0, offY: 0 }],
    },
  },
});
const files: Record<string, string> = {
  'assets-hd/manifest.json': manifest,
  'assets-hd/base/a.png': 'png',
  'assets-hd/hd/a.png': 'png',
};
const reader: HdFileReader = {
  resolve: (p) => (p in files ? p : undefined),
  read: async (p) => enc(files[p]!),
};
const mkDevice = (rgba = true) => {
  const made: unknown[] = [];
  const dev = {
    ...(rgba
      ? {
          createRgbaTexture: (w: number, h: number, _d?: Uint8Array, o?: unknown) => {
            made.push([w, h, o]);
            return { id: 77, width: w, height: h, rgba: true };
          },
        }
      : {}),
  } as unknown as GfxDevice;
  return { dev, made };
};
const decode = async () => ({ width: 4096, height: 4096, data: new Uint8Array(4) });

describe('planHd (flaga)', () => {
  it('domyslne ustawienia: HD RGBA z kaflami aktywne', () => {
    const p = planHd(DEFAULT_SETTINGS);
    expect(p.active).toBe(true);
    expect(p.mode).toBe('hd');
    expect(p.tiles).toBe(true);
  });
  it('hdRgba bez hdMode albo bez wsparcia urzadzenia: nieaktywne', () => {
    expect(planHd({ ...DEFAULT_SETTINGS, hdMode: 'original', hdRgba: true }).active).toBe(false);
    expect(planHd({ ...DEFAULT_SETTINGS, hdRgba: true, hdMode: 'hd' }, false).active).toBe(false);
    expect(planHd({ ...DEFAULT_SETTINGS, hdRgba: true, hdMode: 'hd' }).active).toBe(true);
  });
});

describe('createHd', () => {
  it('plan nieaktywny albo brak createRgbaTexture: null (zero skutkow)', async () => {
    const { dev } = mkDevice();
    const off = planHd({ ...DEFAULT_SETTINGS, hdMode: 'original', hdRgba: false });
    expect(await createHd(off, dev, reader, decode)).toBeNull();
    const act = planHd({ ...DEFAULT_SETTINGS, hdRgba: true, hdMode: 'hd' });
    expect(await createHd(act, mkDevice(false).dev, reader, decode)).toBeNull();
  });
  it('brak manifestu: HdOverride bez wpisow (fallback do oryginalu)', async () => {
    const act = planHd({ ...DEFAULT_SETTINGS, hdRgba: true, hdMode: 'hd' });
    const hd = await createHd(
      act,
      mkDevice().dev,
      { resolve: () => undefined, read: async () => enc('') },
      decode,
    );
    expect(hd!.has('art/critters/hmjmps.frm')).toBe(false);
  });
  it('wgrywa atlas jako RGBA z wybranym filtrem', async () => {
    const act = planHd({ ...DEFAULT_SETTINGS, hdRgba: true, hdMode: 'hd', hdFilter: 'nearest' });
    const { dev, made } = mkDevice();
    const hd = (await createHd(act, dev, reader, decode))!;
    const s = await hd.getSprite('art/critters/hmjmps.frm');
    expect(s!.directions[0]![0]!.texture.rgba).toBe(true);
    expect(made).toEqual([[4096, 4096, { filter: 'nearest' }]]);
  });
  it('vfsDirectoryHandle: brak pliku rzuca', async () => {
    const d = vfsDirectoryHandle(reader, 'assets-hd');
    await expect(d.getFileHandle('nie-ma.json')).rejects.toThrow();
    const sub = await d.getDirectoryHandle('base');
    expect(await (await (await sub.getFileHandle('a.png')).getFile()).text()).toBe('png');
  });
});

describe('SpriteLibrary z HD', () => {
  const baseHandle = (): SpriteHandle => ({
    fps: 10,
    actionFrame: 0,
    framesPerDirection: 1,
    directions: [
      [
        {
          texture: { id: 1, width: 2048, height: 2048 },
          sx: 0,
          sy: 0,
          width: 32,
          height: 64,
          offsetX: 2,
          offsetY: -1,
        },
      ],
    ],
    shiftX: new Int16Array([1]),
    shiftY: new Int16Array([2]),
  });
  const cache = { get: async () => baseHandle() } as unknown as SpriteCache;
  const fids = {
    pathFor: (fid: number) =>
      fid === 1
        ? 'art\\critters\\HMJMPS.FRM'
        : fid === ((4 << 24) | 2)
          ? 'art\\tiles\\t.frm'
          : undefined,
  } as unknown as FidResolver;
  const obj = { rotation: 0, fid: 1 } as unknown as GameObject;

  async function lib(withHd: boolean, tiles = false): Promise<SpriteLibrary> {
    const hd = new HdOverride(vfsDirectoryHandle(reader, 'assets-hd'), {
      loadAtlas: async () => ({ id: 77, width: 4096, height: 4096, rgba: true }),
    });
    await hd.load();
    hd.mode.value = 'base';
    const l = new SpriteLibrary(
      cache,
      fids,
      () => ({ fid: 1, frame: 0 }),
      withHd ? { override: hd, tiles } : undefined,
    );
    await l.ensure('art\\critters\\HMJMPS.FRM');
    await l.ensure('art\\tiles\\t.frm');
    return l;
  }

  it('bez HD: klatka jak dotad (brak pola scale)', async () => {
    const f = (await lib(false)).frameFor(obj)!;
    expect(f.texture.id).toBe(1);
    expect('scale' in f).toBe(false);
    expect([f.width, f.height, f.offsetX, f.offsetY, f.shiftX, f.shiftY]).toEqual([
      32, 64, 2, -1, 1, 2,
    ]);
  });
  it('z HD: tekstura RGBA, scale 4, offset i shift w pikselach HD (x4)', async () => {
    const f = (await lib(true)).frameFor(obj)!;
    expect(f.texture.id).toBe(77);
    expect(f.scale).toBe(4);
    expect([f.width, f.height, f.offsetX, f.offsetY, f.shiftX, f.shiftY]).toEqual([
      128, 256, 8, -4, 4, 8,
    ]);
  });
  it('kafle: domyslnie oryginal, z hdTiles HD ze scale', async () => {
    expect((await lib(true, false)).tileFrame(2)!.texture.id).toBe(1);
    const t = (await lib(true, true)).tileFrame(2)!;
    expect(t.texture.id).toBe(77);
    expect(t.scale).toBe(4);
  });
});
