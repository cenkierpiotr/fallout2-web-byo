import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
import { normalizeDatPath } from '@f2/formats';
import { isGamePath, type PickedFolder } from './pick-folder.js';

export const ZIP_CHUNK = 4 * 1024 * 1024;
const CHUNK = ZIP_CHUNK;
/** Limit lacznej rozpakowanej wielkosci plikow gry (ochrona przed zip-bomb); oryginal to ok. 0,5 GB. */
export const MAX_ZIP_GAME_BYTES = 2 * 1024 * 1024 * 1024;
const DATS = new Set(['master.dat', 'critter.dat', 'patch000.dat']);

/** Czy wpis (sciezka surowa, bez prefiksu) moze byc potrzebny grze; prefiks ustalamy dopiero po przeczytaniu spisu. */
export function maybeGame(path: string): boolean {
  const parts = normalizeDatPath(path).split('/');
  const last = parts[parts.length - 1] ?? '';
  return DATS.has(last) || parts.includes('data');
}

/** Wyznacza katalog gry: ten z master.dat (najplytszy); '' gdy w korzeniu. */
export function gameRoot(paths: string[]): string | null {
  let best: string | null = null;
  for (const p of paths) {
    const n = normalizeDatPath(p);
    if (n === 'master.dat' || n.endsWith('/master.dat')) {
      const root = n.slice(0, n.length - 'master.dat'.length);
      if (best === null || root.length < best.length) best = root;
    }
  }
  return best;
}

/** Importuje ZIP z gra strumieniowo; zwraca pliki jako Blob-y (bez jednej wielkiej tablicy). */
export async function folderFromZip(
  zip: Blob,
  onProgress?: (done: number, total: number) => void,
  maxBytes: number = MAX_ZIP_GAME_BYTES,
  signal?: AbortSignal,
): Promise<PickedFolder> {
  const collected = new Map<string, Uint8Array[]>();
  let failure: Error | null = null;
  let seen = 0;
  let inflated = 0;
  const unzip = new Unzip((entry) => {
    seen++;
    const name = entry.name;
    if (name.startsWith('/') || name.split(/[\\/]/).includes('..')) {
      failure = new Error('zip: niebezpieczna sciezka');
      return;
    }
    if (name.endsWith('/') || !maybeGame(name)) return;
    const chunks: Uint8Array[] = [];
    entry.ondata = (err, data) => {
      if (err) failure = err;
      else if (data.length > 0) {
        inflated += data.length;
        if (inflated > maxBytes) {
          failure = new Error('zip: archiwum zbyt duze po rozpakowaniu');
          entry.terminate();
          chunks.length = 0;
          return;
        }
        chunks.push(data);
      }
    };
    collected.set(name, chunks);
    entry.start();
  });
  unzip.register(UnzipInflate);
  unzip.register(UnzipPassThrough);

  const total = zip.size;
  try {
    for (let o = 0; o < total; o += CHUNK) {
      if (signal?.aborted) throw new DOMException('Przerwano', 'AbortError');
      const buf = new Uint8Array(await zip.slice(o, o + CHUNK).arrayBuffer());
      unzip.push(buf, o + CHUNK >= total);
      if (failure) throw failure;
      onProgress?.(Math.min(o + CHUNK, total), total);
    }
    if (total === 0 || seen === 0) throw new Error('zip: nieprawidlowe archiwum');
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw e instanceof Error && e.message.startsWith('zip:')
      ? e
      : new Error(
          `zip: nie mozna odczytac archiwum (${e instanceof Error ? e.message : String(e)})`,
        );
  }

  const root = gameRoot([...collected.keys()]);
  const files = new Map<string, File>();
  if (root !== null) {
    for (const [name, chunks] of collected) {
      const n = normalizeDatPath(name);
      if (!n.startsWith(root)) continue;
      const key = n.slice(root.length);
      if (isGamePath(key))
        files.set(key, new File(chunks as BlobPart[], key.split('/').pop() ?? key));
    }
  }
  return { kind: 'files', files };
}
