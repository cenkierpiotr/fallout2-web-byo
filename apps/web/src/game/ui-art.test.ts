import { describe, expect, it, vi } from 'vitest';
import type { Frm } from '@f2/formats';
import { createUiArt } from './ui-art';

function frm(): Frm {
  const mk = (v: number) => ({ width: 1, height: 1, offsetX: 0, offsetY: 0, pixels: new Uint8Array([v]) });
  return { directions: [[mk(1), mk(2)]] } as unknown as Frm;
}
const pal = new Uint8Array(256 * 4).fill(10);
pal[4] = 11;
pal[8] = 22;
const toUrl = (rgba: Uint8ClampedArray, w: number, h: number) => `u:${rgba[0]}:${w}x${h}`;
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('createUiArt', () => {
  it('zwraca undefined, potem obraz po zaladowaniu i woła subskrybenta', async () => {
    const art = createUiArt({ pathFor: () => 'a.frm', loadFrm: async () => frm(), paletteRgba: pal, toUrl });
    const cb = vi.fn();
    art.subscribe(cb);
    expect(art.get('a')).toBeUndefined();
    await tick();
    expect(cb).toHaveBeenCalled();
    expect(art.get('a')).toEqual({ url: 'u:11:1x1', width: 1, height: 1 });
  });
  it('zwraca null gdy loadFrm rzuca', async () => {
    const art = createUiArt({ pathFor: () => 'a.frm', loadFrm: async () => { throw new Error('x'); }, paletteRgba: pal, toUrl });
    art.get('a');
    await tick();
    expect(art.get('a')).toBeNull();
  });
  it('drugie get tej samej nazwy nie wola loadFrm drugi raz', async () => {
    const loadFrm = vi.fn(async () => frm());
    const art = createUiArt({ pathFor: () => 'a.frm', loadFrm, paletteRgba: pal, toUrl });
    art.get('a');
    art.get('a');
    await tick();
    art.get('a');
    expect(loadFrm).toHaveBeenCalledTimes(1);
  });
  it('get(name, 1) uzywa klatki 1 kierunku 0', async () => {
    const art = createUiArt({ pathFor: () => 'a.frm', loadFrm: async () => frm(), paletteRgba: pal, toUrl });
    art.get('a', 1);
    await tick();
    expect(art.get('a', 1)?.url).toBe('u:22:1x1');
  });
});
