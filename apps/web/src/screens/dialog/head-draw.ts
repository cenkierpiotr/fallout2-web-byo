export interface HeadFrame {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

interface Ctx2d<I> {
  clearRect(x: number, y: number, w: number, h: number): void;
  putImageData(img: I, x: number, y: number): void;
}

/** Sygnal ust (klatka 0..8) -> indeks klatki FRM; zle wartosci daja 0, nadmiar ostatnia klatke. */
export function mouthIndex(mouth: number, count: number): number {
  if (count <= 0 || !Number.isFinite(mouth)) return 0;
  return Math.min(Math.max(Math.trunc(mouth), 0), count - 1);
}

/** Rysuje klatke glowy dla danego stanu ust. Zwraca narysowany indeks lub -1 gdy brak klatek. */
export function drawHead<I>(
  ctx: Ctx2d<I>,
  frames: readonly HeadFrame[],
  mouth: number,
  makeImage: (data: Uint8ClampedArray, w: number, h: number) => I,
): number {
  ctx.clearRect(0, 0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  if (frames.length === 0) return -1;
  const i = mouthIndex(mouth, frames.length);
  const f = frames[i]!;
  ctx.putImageData(makeImage(f.rgba, f.width, f.height), 0, 0);
  return i;
}
