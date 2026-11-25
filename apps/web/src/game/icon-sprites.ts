import type { Frm, FrmFrame } from '@f2/formats';
import type { SpriteUrl } from '@f2/ui';

/** Klatka FRM (indeksy palety) -> RGBA; indeks 0 = przezroczysty (konwencja FRM). */
export function frameToRgba(frame: FrmFrame, paletteRgba: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(frame.width * frame.height * 4);
  for (let i = 0; i < frame.width * frame.height; i++) {
    const idx = frame.pixels[i] ?? 0;
    if (idx === 0) continue;
    out[i * 4] = paletteRgba[idx * 4] ?? 0;
    out[i * 4 + 1] = paletteRgba[idx * 4 + 1] ?? 0;
    out[i * 4 + 2] = paletteRgba[idx * 4 + 2] ?? 0;
    out[i * 4 + 3] = 255;
  }
  return out;
}

export interface IconSpriteDeps {
  /** Sciezka FRM dla FID (FidResolver.pathFor). */
  pathFor(fid: number): string | undefined;
  loadFrm(path: string): Promise<Frm>;
  /** Paleta 256*4 (Palette.rgba). */
  paletteRgba: Uint8Array;
  /** Zamiana RGBA na URL obrazka (przegladarka: canvas.toDataURL); wstrzykiwane dla testow. */
  toUrl(rgba: Uint8ClampedArray, width: number, height: number): string;
  /** Wolane po zaladowaniu nowej ikony: odswiez widok. */
  onLoaded?(): void;
}

/**
 * Zrodlo ikon inwentarza (FID typu 7 = inven). Synchroniczne `sprite(fid)` zwraca URL z cache albo undefined
 * i w tle laduje FRM; po zaladowaniu woła `onLoaded`.
 */
export function createIconSprites(deps: IconSpriteDeps): SpriteUrl {
  const cache = new Map<number, string | null>();
  const pending = new Set<number>();
  return (fid: number): string | undefined => {
    const hit = cache.get(fid);
    if (hit !== undefined) return hit ?? undefined;
    if (pending.has(fid)) return undefined;
    const path = deps.pathFor(fid);
    if (!path) return undefined;
    pending.add(fid);
    void deps
      .loadFrm(path)
      .then((frm) => {
        const f = frm.directions[0]?.[0];
        cache.set(fid, f ? deps.toUrl(frameToRgba(f, deps.paletteRgba), f.width, f.height) : null);
      })
      .catch(() => cache.set(fid, null))
      .finally(() => {
        pending.delete(fid);
        deps.onLoaded?.();
      });
    return undefined;
  };
}

/** Przegladarkowy `toUrl` przez canvas. */
export function canvasToUrl(rgba: Uint8ClampedArray, width: number, height: number): string {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  c.getContext('2d')?.putImageData(
    new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, width, height),
    0,
    0,
  );
  return c.toDataURL();
}
