import { describe, expect, it } from 'vitest';
import { animFileChars } from '@f2/engine-core';
import { FidResolver, makeCritterFid, parseFid } from './fid-path';

describe('fid-path', () => {
  it('rozbija FID na czesci', () => {
    const fid = ((2 << 28) | (1 << 24) | (19 << 16) | (3 << 12) | 77) >>> 0;
    expect(parseFid(fid)).toEqual({ index: 77, weapon: 3, anim: 19, type: 1, orientation: 2 });
  });
  it('makeCritterFid sklada FID krytera', () => {
    expect(parseFid(makeCritterFid(5, 1))).toMatchObject({ type: 1, index: 5, anim: 1, weapon: 0 });
  });
  it('litery animacji: aa idle, ab chod, at bieg, ba upadek', () => {
    expect(animFileChars(0, 0)).toBe('aa');
    expect(animFileChars(1, 0)).toBe('ab');
    expect(animFileChars(19, 0)).toBe('at');
    expect(animFileChars(0x14, 0)).toBe('ba');
  });
  it('litery animacji: bron 0x26..0x2F, wstawanie 0x24/0x25, smierci SF 0x30..', () => {
    expect(animFileChars(0x23, 0)).toBe('bp');
    expect(animFileChars(0x24, 0)).toBe('ch');
    expect(animFileChars(0x25, 0)).toBe('cj');
    expect(animFileChars(0x26, 1)).toBe('dc'); // nóz: dobycie
    expect(animFileChars(0x2b, 5)).toBe('hh'); // pistolet: celowanie
    expect(animFileChars(0x2d, 5)).toBe('hj'); // pistolet: strzal
    expect(animFileChars(0x2e, 6)).toBe('ik'); // SMG: seria
    expect(animFileChars(0x2f, 8)).toBe('kl'); // duza bron: ciagly
    expect(animFileChars(0x30, 0)).toBe('ra');
    expect(animFileChars(0x3f, 0)).toBe('rp');
  });

  it('pathFor: brak wpisu przed load nie jest zapamietywany, po load sciezka z cache', async () => {
    const files = new Map<string, Uint8Array>();
    const enc = new TextEncoder();
    files.set('art/tiles/tiles.lst', enc.encode('grid000.frm\r\nfloor1.frm\r\n'));
    const layer = {};
    const vfs = {
      layers: [layer],
      resolve: (p: string) => (files.has(p) ? layer : undefined),
      open: async (p: string) => {
        const b = files.get(p);
        if (!b) throw new Error('brak pliku');
        return b;
      },
    };
    const r = new FidResolver(vfs as never);
    const fid = (4 << 24) | 1;
    expect(r.pathFor(fid)).toBeUndefined();
    await r.load();
    expect(r.pathFor(fid)).toBe('art/tiles/floor1.frm');
    expect(r.pathFor(fid)).toBe('art/tiles/floor1.frm');
  });
});
