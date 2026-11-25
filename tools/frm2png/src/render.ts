import { frameToRgba } from '@f2/formats';
import type { Frm, Palette } from '@f2/formats';

/** Klatki jednego kierunku obok siebie (odstep 1 px), pozycje wg kumulatywnych offsetX/offsetY. */
export function renderSheet(
  frm: Frm,
  palette: Palette,
  dir: number,
): { rgba: Uint8ClampedArray; width: number; height: number } {
  if (!Number.isInteger(dir) || dir < 0 || dir > 5) throw new Error(`kierunek ${dir} poza 0..5`);
  const frames = frm.directions[dir];
  if (!frames || frames.length === 0) throw new Error(`kierunek ${dir} nie ma klatek`);
  // offsety kumulatywnie (wg dokumentacja techniczna); klatki obok siebie z odstepem 1 px,
  // dodatkowo przesuniete o kumulatywny offsetX/offsetY wzgledem najmniejszego
  const cumX: number[] = [];
  const cumY: number[] = [];
  let accX = 0;
  let accY = 0;
  for (const f of frames) {
    accX += f.offsetX;
    accY += f.offsetY;
    cumX.push(accX);
    cumY.push(accY);
  }
  const minX = Math.min(...cumX);
  const minY = Math.min(...cumY);
  const ys = cumY.map((c) => c - minY);
  let base = 0;
  const xs = cumX.map((c, i) => {
    const x = base + (c - minX);
    base += frames[i]!.width + 1;
    return x;
  });
  const width = Math.max(...frames.map((f, i) => xs[i]! + f.width));
  const height = Math.max(...frames.map((f, i) => ys[i]! + f.height));
  const rgba = new Uint8ClampedArray(width * height * 4);
  frames.forEach((f, i) => {
    const px = frameToRgba(f, palette.rgba);
    for (let y = 0; y < f.height; y++) {
      const dst = ((ys[i]! + y) * width + xs[i]!) * 4;
      rgba.set(px.subarray(y * f.width * 4, (y + 1) * f.width * 4), dst);
    }
  });
  return { rgba, width, height };
}
