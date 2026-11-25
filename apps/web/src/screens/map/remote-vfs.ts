import { normalizeDatPath } from '@f2/formats';
import type { VirtualFs } from '@f2/vfs';

/** Minimalny kontrakt klienta dekodowania (DecodeClient), potrzebny do zdalnego VFS. */
export interface RemoteFiles {
  read(path: string): Promise<Uint8Array>;
  list(prefix: string): Promise<string[]>;
}

/**
 * VFS po stronie watku glownego nad workerem dekodujacym. Pelna lista kluczy jest pobrana raz,
 * wiec `resolve`/`list` sa synchroniczne, jak w prawdziwym VirtualFs (wymagaja tego MapLoader
 * i ProtoCache). Klucze `data/...` to warstwa overlay (nieoficjalna latka) i maja pierwszenstwo,
 * co odwzorowuje kolejnosc `layers` (overlay przed archiwami).
 */
export interface RemoteVfs {
  vfs: VirtualFs;
  /** Sciezka klucza o najwyzszym priorytecie (z prefiksem `data/` gdy plik jest w overlay). */
  canonical(path: string): string | undefined;
  has(path: string): boolean;
  keys(prefix: string): string[];
}

export async function createRemoteVfs(files: RemoteFiles): Promise<RemoteVfs> {
  const all = await files.list('');
  const set = new Set(all);
  const overlayLayer = { name: 'overlay' };
  const archiveLayer = { name: 'archive' };

  const canonical = (path: string): string | undefined => {
    const p = normalizeDatPath(path);
    if (p.startsWith('data/')) return set.has(p) ? p : undefined;
    const over = `data/${p}`;
    if (set.has(over)) return over;
    return set.has(p) ? p : undefined;
  };

  const vfs = {
    layers: [overlayLayer, archiveLayer],
    resolve(path: string) {
      const p = normalizeDatPath(path);
      if (!set.has(p)) return undefined;
      return p.startsWith('data/') ? overlayLayer : archiveLayer;
    },
    open(path: string): Promise<Uint8Array> {
      const p = normalizeDatPath(path);
      if (!set.has(p)) return Promise.reject(new Error(`brak pliku: ${path}`));
      return files.read(p);
    },
    list(prefix = ''): string[] {
      let p = normalizeDatPath(prefix);
      if (p !== '' && !p.endsWith('/')) p += '/';
      return all.filter((k) => k.startsWith(p));
    },
  } as unknown as VirtualFs;

  return {
    vfs,
    canonical,
    has: (path) => canonical(path) !== undefined,
    keys: (prefix) => vfs.list(prefix),
  };
}
