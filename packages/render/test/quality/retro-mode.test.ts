import { describe, expect, it } from 'vitest';
import { PaletteCycler } from '../../src/palette/PaletteCycler.js';
import { resolvePreset } from '../../src/quality/QualityPresets.js';
import { indexedToRgba, isRetro, paletteLookup } from '../../src/quality/retro.js';

function synthPalette(): Uint8Array {
  const p = new Uint8Array(1024);
  for (let i = 0; i < 256; i++) {
    p[i * 4] = i;
    p[i * 4 + 1] = (i * 7) & 255;
    p[i * 4 + 2] = (i * 13) & 255;
    p[i * 4 + 3] = 255;
  }
  return p;
}

describe('tryb retro', () => {
  it('paletteLookup zwraca dokladnie kolor z palety', () => {
    const pal = synthPalette();
    for (let i = 0; i < 256; i++) {
      expect(paletteLookup(pal, i)).toEqual([i, (i * 7) & 255, (i * 13) & 255, 255]);
    }
  });

  it('indexedToRgba: indeks 0 przezroczysty, reszta == paleta', () => {
    const pal = synthPalette();
    const out = indexedToRgba(Uint8Array.from([0, 5, 255]), pal);
    expect(Array.from(out.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(Array.from(out.slice(4, 8))).toEqual(paletteLookup(pal, 5));
    expect(Array.from(out.slice(8, 12))).toEqual(paletteLookup(pal, 255));
  });

  it('cykl palety zmienia kolor indeksu 233, ale nie 10', () => {
    const c = new PaletteCycler(synthPalette());
    const before233 = paletteLookup(c.getPalette(), 233);
    const before10 = paletteLookup(c.getPalette(), 10);
    expect(c.tick(100)).toBe(true);
    expect(paletteLookup(c.getPalette(), 233)).not.toEqual(before233);
    expect(paletteLookup(c.getPalette(), 10)).toEqual(before10);
  });

  it('preset retro', () => {
    const s = resolvePreset('retro', { mobile: false, dpr: 1 });
    expect(s.hd === false && s.postfx.crt === true).toBe(true);
    expect(isRetro(s)).toBe(true);
    expect(isRetro(resolvePreset('wysoki', { mobile: false, dpr: 1 }))).toBe(false);
  });
});
