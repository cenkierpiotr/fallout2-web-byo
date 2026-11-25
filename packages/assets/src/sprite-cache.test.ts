import { describe, expect, it } from 'vitest';
import type { Frm } from '@f2/formats';
import type { GfxDevice, IndexedTexture } from '@f2/render';
import { SpriteCache } from './sprite-cache.js';

function fakeDevice() {
  const calls = { create: 0, update: 0 };
  const device = {
    createIndexedTexture(width: number, height: number): IndexedTexture {
      return { id: ++calls.create, width, height };
    },
    updateIndexedTexture() {
      calls.update++;
    },
  } as unknown as GfxDevice;
  return { device, calls };
}

function makeFrm(dirs: number, frames: number, w: number, h: number): Frm {
  const directions = Array.from({ length: dirs }, () =>
    Array.from({ length: frames }, () => ({
      width: w,
      height: h,
      offsetX: 1,
      offsetY: 2,
      pixels: new Uint8Array(w * h),
    })),
  );
  return {
    version: 4,
    fps: 10,
    actionFrame: 1,
    framesPerDirection: frames,
    shiftX: new Int16Array(dirs),
    shiftY: new Int16Array(dirs),
    directionOffsets: new Uint32Array(dirs),
    dataSize: 0,
    directions,
    distinctDirections: dirs,
  };
}

describe('SpriteCache', () => {
  it('wgrywa klatki do atlasu i memoizuje po sciezce', async () => {
    const { device, calls } = fakeDevice();
    let loads = 0;
    const cache = new SpriteCache(device, async () => {
      loads++;
      return makeFrm(6, 2, 10, 10);
    });
    const h = await cache.get('art/a.frm');
    expect(h.directions[5]!.length).toBe(2);
    expect(h.fps).toBe(10);
    expect(h.directions[0]![0]!.offsetX).toBe(1);
    expect(cache.pages).toBe(1);
    expect(calls.update).toBe(12);
    const h2 = await cache.get('art/a.frm');
    expect(h2).toBe(h);
    expect(loads).toBe(1);
  });

  it('wspolbiezne get tej samej sciezki laduje raz', async () => {
    const { device } = fakeDevice();
    let loads = 0;
    const cache = new SpriteCache(device, async () => {
      loads++;
      return makeFrm(1, 1, 4, 4);
    });
    await Promise.all([cache.get('x'), cache.get('x')]);
    expect(loads).toBe(1);
  });

  it('otwiera nowa strone gdy pelna, a duza klatke daje osobna tekstura', async () => {
    const { device, calls } = fakeDevice();
    const cache = new SpriteCache(
      device,
      async (p) => (p === 'big' ? makeFrm(1, 1, 40, 40) : makeFrm(1, 5, 10, 10)),
      22,
    );
    await cache.get('s');
    expect(cache.pages).toBe(2);
    const before = calls.create;
    const big = await cache.get('big');
    expect(calls.create).toBe(before + 1);
    expect(big.directions[0]![0]!.texture.width).toBe(40);
  });

  it('tileBands: kafle z art/tiles dostaja pasma, inne sciezki nie', async () => {
    const { device } = fakeDevice();
    const frm = makeFrm(1, 1, 8, 4);
    frm.directions[0]![0]!.pixels.fill(3, 8, 24);
    const cache = new SpriteCache(device, async () => frm, 2048, 2);
    const t = await cache.get('art/tiles/edg1001.frm');
    expect(t.directions[0]![0]!.bands).toEqual([
      { x0: 0, y0: 0, x1: 8, y1: 2 },
      { x0: 0, y0: 2, x1: 8, y1: 4 },
    ]);
    expect((await cache.get('art/scenery/x.frm')).directions[0]![0]!.bands).toBeUndefined();
    const off = new SpriteCache(device, async () => frm);
    expect((await off.get('art/tiles/a.frm')).directions[0]![0]!.bands).toBeUndefined();
  });
});
