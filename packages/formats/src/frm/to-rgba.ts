import { FormatError } from '../errors.js';
import type { FrmFrame } from './index.js';

/** Indeks 0 -> przezroczysty; reszta kolor z palety z alpha 255. */
export function frameToRgba(
  frame: FrmFrame,
  paletteRgba: Uint8Array,
  out?: Uint8ClampedArray,
): Uint8ClampedArray {
  if (paletteRgba.length < 1024) throw new FormatError('frm', 'paleta RGBA krotsza niz 1024 B');
  const n = frame.width * frame.height;
  if (frame.pixels.length < n) throw new FormatError('frm', 'pixels krotsze niz width*height');
  const res = out ?? new Uint8ClampedArray(n * 4);
  if (res.length < n * 4) throw new FormatError('frm', 'bufor wyjsciowy za maly');
  for (let i = 0; i < n; i++) {
    const idx = frame.pixels[i]!;
    const o = i * 4;
    if (idx === 0) {
      res[o] = 0;
      res[o + 1] = 0;
      res[o + 2] = 0;
      res[o + 3] = 0;
    } else {
      const p = idx * 4;
      res[o] = paletteRgba[p]!;
      res[o + 1] = paletteRgba[p + 1]!;
      res[o + 2] = paletteRgba[p + 2]!;
      res[o + 3] = 255;
    }
  }
  return res;
}
