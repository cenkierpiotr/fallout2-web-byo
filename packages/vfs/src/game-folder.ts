import type { Dat2Index, RandomAccessSource } from '@f2/formats';
import { Dat2Layer } from './dat2-layer.js';
import type { VfsLayer } from './layer.js';
import { VirtualFs } from './vfs.js';

export interface GameFolderFiles {
  master: RandomAccessSource;
  critter: RandomAccessSource;
  patch?: RandomAccessSource;
  overlay?: VfsLayer;
}

export interface IndexCache {
  get(key: string): Promise<Dat2Index | undefined>;
  set(key: string, index: Dat2Index): Promise<void>;
}

/** Kolejnosc warstw: overlay, patch000, critter, master. */
export async function openGameFolder(
  files: GameFolderFiles,
  cache?: IndexCache,
  keys?: { master: string; critter: string; patch?: string },
): Promise<VirtualFs> {
  const openLayer = async (
    name: string,
    src: RandomAccessSource,
    key: string | undefined,
  ): Promise<Dat2Layer> => {
    if (cache && !key) {
      throw new Error(`cache indeksu wymaga klucza dla warstwy ${name} (podaj keys)`);
    }
    const cached = cache && key ? await cache.get(key) : undefined;
    const layer = await Dat2Layer.open(name, src, cached);
    // brak w cache albo nieaktualny (Dat2Layer przeparsowal) -> zapisz swiezy indeks
    if (cache && key && layer.index !== cached) await cache.set(key, layer.index);
    return layer;
  };
  const layers: VfsLayer[] = [];
  if (cache && !keys) throw new Error('cache indeksu wymaga kluczy (keys)');
  if (files.overlay) layers.push(files.overlay);
  if (files.patch) layers.push(await openLayer('patch000', files.patch, keys?.patch));
  layers.push(await openLayer('critter', files.critter, keys?.critter));
  layers.push(await openLayer('master', files.master, keys?.master));
  return new VirtualFs(layers);
}
