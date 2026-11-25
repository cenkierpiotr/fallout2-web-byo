export const THUMB_WIDTH = 160;
export const THUMB_HEIGHT = 100;

/** Skaluje canvas do 160x100 i zwraca JPEG (cover, srodek). */
export async function captureThumbnail(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  // Safari < 16.4 nie ma OffscreenCanvas: fallback na zwykly <canvas> + toBlob.
  const useOffscreen = typeof OffscreenCanvas !== 'undefined';
  const out: OffscreenCanvas | HTMLCanvasElement = useOffscreen
    ? new OffscreenCanvas(THUMB_WIDTH, THUMB_HEIGHT)
    : Object.assign(document.createElement('canvas'), { width: THUMB_WIDTH, height: THUMB_HEIGHT });
  const ctx = out.getContext('2d') as
    OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('brak kontekstu 2d');
  const sw = canvas.width;
  const sh = canvas.height;
  const scale = Math.max(THUMB_WIDTH / sw, THUMB_HEIGHT / sh);
  const cw = THUMB_WIDTH / scale;
  const ch = THUMB_HEIGHT / scale;
  ctx.drawImage(canvas, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
  if (out instanceof HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) =>
      out.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob zwrocil null'))),
        'image/jpeg',
        0.7,
      ),
    );
  }
  return out.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(s)}`;
}
