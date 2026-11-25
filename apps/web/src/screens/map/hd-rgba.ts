import { HdOverride, type DirectoryHandleLike, type HdMode } from '@f2/assets';
import type { GfxDevice, IndexedTexture } from '@f2/render';
import type { Settings } from '../../settings';

/** Katalog HD w VFS (np. <latka>/data/assets-hd): manifest.json oraz base/ i hd/ z atlasami PNG. */
export const HD_ROOT = 'assets-hd';

export interface HdPlan {
  /** Czy sciezka RGBA jest wlaczona (false = zadnego kodu HD, render jak dotad). */
  active: boolean;
  mode: HdMode;
  filter: 'linear' | 'nearest';
  tiles: boolean;
}

/** Czysta funkcja: ustawienia -> plan HD. Wymaga hdRgba ORAZ hdMode != 'original'. */
export function planHd(
  s: Pick<Settings, 'hdRgba' | 'hdMode' | 'hdFilter' | 'hdTiles'>,
  deviceSupportsRgba = true,
): HdPlan {
  const active = s.hdRgba && s.hdMode !== 'original' && deviceSupportsRgba;
  return { active, mode: active ? s.hdMode : 'original', filter: s.hdFilter, tiles: s.hdTiles };
}

export interface HdFileReader {
  /** Kanoniczna sciezka pliku w VFS albo undefined. */
  resolve(path: string): string | undefined;
  read(path: string): Promise<Uint8Array>;
}

/** Adapter VFS -> DirectoryHandleLike (kontrakt HdOverride), pod prefiksem `prefix`. */
export function vfsDirectoryHandle(reader: HdFileReader, prefix: string): DirectoryHandleLike {
  const join = (n: string): string => `${prefix}/${n}`;
  return {
    async getFileHandle(name) {
      const p = reader.resolve(join(name));
      if (!p) throw new Error(`brak pliku HD: ${join(name)}`);
      return {
        async getFile() {
          const bytes = await reader.read(p);
          const copy = bytes.slice().buffer as ArrayBuffer;
          return {
            text: async () => new TextDecoder().decode(bytes),
            arrayBuffer: async () => copy,
          };
        },
      };
    },
    async getDirectoryHandle(name) {
      return vfsDirectoryHandle(reader, join(name));
    },
  };
}

export interface DecodedImage {
  width: number;
  height: number;
  /** Proste (straight) RGBA, width*height*4. */
  data: Uint8Array;
}

/** Dekoder PNG w przegladarce (createImageBitmap + canvas); w testach podmieniany. */
export async function decodePngBrowser(png: ArrayBuffer): Promise<DecodedImage> {
  const bmp = await createImageBitmap(new Blob([png], { type: 'image/png' }), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('brak kontekstu 2d do dekodowania atlasu HD');
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close();
  return { width: img.width, height: img.height, data: new Uint8Array(img.data.buffer) };
}

/**
 * HdOverride dla biezacego planu albo null (plan nieaktywny, urzadzenie bez RGBA, brak manifestu).
 * Brak manifestu/atlasu nie jest bledem: HdOverride degraduje do oryginalu per asset.
 */
export async function createHd(
  plan: HdPlan,
  device: GfxDevice,
  reader: HdFileReader,
  decode: (png: ArrayBuffer) => Promise<DecodedImage> = decodePngBrowser,
): Promise<HdOverride | null> {
  if (!plan.active || !device.createRgbaTexture) return null;
  const create = device.createRgbaTexture.bind(device);
  const hd = new HdOverride(vfsDirectoryHandle(reader, HD_ROOT), {
    // atlasy nie sa zwalniane przy wypieraniu (sprite'y moga je jeszcze trzymac), wiec limit wysoki
    maxAtlases: 64,
    async loadAtlas(png): Promise<IndexedTexture> {
      const img = await decode(png);
      return create(img.width, img.height, img.data, { filter: plan.filter });
    },
  });
  await hd.load();
  hd.mode.value = plan.mode;
  return hd;
}
