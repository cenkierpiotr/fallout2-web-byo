import type { QualitySettings } from './QualityPresets.js';

/** Kolor RGBA indeksu z palety 1024 B (index & 255). */
export function paletteLookup(pal: Uint8Array, index: number): [number, number, number, number] {
  const o = (index & 255) * 4;
  return [pal[o]!, pal[o + 1]!, pal[o + 2]!, pal[o + 3]!];
}

/** Obraz indeksowany -> RGBA; indeks `transparentIndex` daje alfa 0. */
export function indexedToRgba(
  indices: Uint8Array,
  pal: Uint8Array,
  transparentIndex = 0,
): Uint8Array {
  const out = new Uint8Array(indices.length * 4);
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i]!;
    const o = idx * 4;
    out[i * 4] = pal[o]!;
    out[i * 4 + 1] = pal[o + 1]!;
    out[i * 4 + 2] = pal[o + 2]!;
    out[i * 4 + 3] = idx === transparentIndex ? 0 : 255;
  }
  return out;
}

export function isRetro(s: QualitySettings): boolean {
  return s.paletteMode === 1 && !s.hd;
}
