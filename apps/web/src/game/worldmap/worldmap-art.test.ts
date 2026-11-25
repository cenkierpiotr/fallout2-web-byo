import { describe, expect, it } from 'vitest';
import { loadWorldmapArt, lstName, parseLst } from './worldmap-art';

const fakeDoc = {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({ putImageData: () => undefined }),
  }),
} as unknown as Document;
(globalThis as Record<string, unknown>)['ImageData'] ??= class {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
};
const frm = (w = 2, h = 2) => [{ width: w, height: h, rgba: new Uint8ClampedArray(w * h * 4) }];

describe('worldmap-art: lst i loader', () => {
  it('lstName: pierwszy token, male litery, -1 i poza zakresem = undefined', () => {
    const lst = parseLst('a.frm ; x\r\ntwnden.frm   ; Town map "Den"\n');
    expect(lstName(lst, 1)).toBe('twnden.frm');
    expect(lstName(lst, 0)).toBe('a.frm');
    expect(lstName(lst, -1)).toBeUndefined();
    expect(lstName(lst, 99)).toBeUndefined();
  });
  it('bez plikow gry: wszystko puste, bez wyjatku', async () => {
    const art = await loadWorldmapArt(async () => null, { doc: fakeDoc });
    expect(art.frame).toBeNull();
    expect(art.dial).toEqual([]);
    expect(art.encounter).toEqual({ rnd: [], fgt: [], icons: [null, null, null, null] });
    expect(art.townmap).toBeUndefined();
    expect(art.labels?.size).toBe(0);
  });
  it('etykiety i mapy miast wg townmap_*_art_idx z intrface.lst, mapy leniwie z cache', async () => {
    const calls: string[] = [];
    const load = async (p: string) => {
      calls.push(p);
      return p.includes('missing') ? null : frm();
    };
    const lst = 'x.frm\nTWNDEN.FRM ; map\nWM_DEN.FRM ; label\nmissing.frm\n';
    const art = await loadWorldmapArt(load, {
      doc: fakeDoc,
      readText: async () => lst,
      areas: [
        { townmapArtIdx: 1, townmapLabelArtIdx: 2 },
        { townmapArtIdx: 3, townmapLabelArtIdx: -1 },
      ],
    });
    expect(art.labels?.get(0)).toBeTruthy();
    expect(art.labels?.has(1)).toBe(false);
    expect(art.frame).toBeTruthy();
    expect(calls.some((c) => c.includes('twnden'))).toBe(false);
    expect(await art.townmap!(0)).toBeTruthy();
    expect(await art.townmap!(0)).toBeTruthy();
    expect(calls.filter((c) => c.includes('twnden')).length).toBe(1);
    expect(await art.townmap!(1)).toBeNull();
    expect(await art.townmap!(7)).toBeNull();
  });
  it('stara sygnatura (Document) nadal dziala', async () => {
    const art = await loadWorldmapArt(async () => frm(), fakeDoc);
    expect(art.tiles).toHaveLength(20);
  });
});
