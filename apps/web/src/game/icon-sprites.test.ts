import { describe, expect, it, vi } from 'vitest';
import type { Frm } from '@f2/formats';
import { createIconSprites, frameToRgba } from './icon-sprites.js';

const pal = new Uint8Array(1024);
pal.set([10, 20, 30, 255], 4);

describe('icon-sprites', () => {
  it('frameToRgba: indeks 0 przezroczysty, reszta z palety', () => {
    const rgba = frameToRgba(
      { width: 2, height: 1, offsetX: 0, offsetY: 0, pixels: Uint8Array.from([0, 1]) },
      pal,
    );
    expect(Array.from(rgba)).toEqual([0, 0, 0, 0, 10, 20, 30, 255]);
  });
  it('createIconSprites: pierwszy odczyt undefined, potem URL z cache; brak sciezki = undefined', async () => {
    const frm = {
      directions: [[{ width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: Uint8Array.from([1]) }]],
    } as unknown as Frm;
    const loadFrm = vi.fn(async () => frm);
    const onLoaded = vi.fn();
    const sprite = createIconSprites({
      pathFor: (fid) => (fid === 7 ? 'art/inven/x.frm' : undefined),
      loadFrm,
      paletteRgba: pal,
      toUrl: (_r, w, h) => `url:${w}x${h}`,
      onLoaded,
    });
    expect(sprite(7)).toBeUndefined();
    expect(sprite(99)).toBeUndefined();
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalled());
    expect(sprite(7)).toBe('url:1x1');
    expect(loadFrm).toHaveBeenCalledTimes(1);
  });
});
