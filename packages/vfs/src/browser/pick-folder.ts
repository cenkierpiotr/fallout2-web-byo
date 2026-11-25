import { normalizeDatPath } from '@f2/formats';
import { MemoryLayer } from '../memory-layer.js';
import type { GameFolderFiles } from '../game-folder.js';
import { parseDdrawIni } from '../mods/ddraw-ini.js';
import { buildModLayers, type ModFs, type ModFsEntry, type ModLayers } from '../mods/mod-layers.js';
import { parseModsOrder } from '../mods/mods-order.js';
import { fileSource, readBlob } from './file-source.js';

export interface PickedFolder {
  kind: 'fsa' | 'files' | 'opfs';
  /** klucz: sciezka wzgledna znormalizowana (male litery, '/') */
  files: Map<string, File>;
  handle?: FileSystemDirectoryHandle;
}

export function supportsFsa(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Czy sciezka (znormalizowana) jest potrzebna grze: 3 pliki DAT, data/**, ddraw.ini lub mods/**. */
export function isGamePath(key: string): boolean {
  return (
    key === 'master.dat' ||
    key === 'critter.dat' ||
    key === 'patch000.dat' ||
    key.startsWith('data/') ||
    key === 'ddraw.ini' ||
    key.startsWith('mods/')
  );
}

/** Rekurencyjnie zbiera pliki z katalogu; opcjonalnie tylko potrzebne grze. */
export async function walkDirectory(
  dir: FileSystemDirectoryHandle,
  onlyGame: boolean,
  prefix = '',
  out: Map<string, File> = new Map(),
): Promise<Map<string, File>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for await (const [name, entry] of (dir as any).entries() as AsyncIterable<
    [string, FileSystemHandle]
  >) {
    const key = normalizeDatPath(prefix + name);
    if (entry.kind === 'directory') {
      if (onlyGame && prefix === '' && key !== 'data' && key !== 'mods') continue;
      await walkDirectory(entry as FileSystemDirectoryHandle, onlyGame, key + '/', out);
    } else if (!onlyGame || isGamePath(key)) {
      out.set(key, await (entry as FileSystemFileHandle).getFile());
    }
  }
  return out;
}

export async function pickFolderFsa(): Promise<PickedFolder | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
      mode: 'read',
    });
    const files = await walkDirectory(handle, true);
    return { kind: 'fsa', files, handle };
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return null;
    throw e;
  }
}

export function folderFromFileList(list: FileList): PickedFolder {
  const files = new Map<string, File>();
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (!f) continue;
    const rel = f.webkitRelativePath || f.name;
    const parts = rel.split('/');
    const key = normalizeDatPath(parts.length > 1 ? parts.slice(1).join('/') : rel);
    files.set(key, f);
  }
  return { kind: 'files', files };
}

const cacheKey = (f: File): string => `${f.name.toLowerCase()}:${f.size}:${f.lastModified}`;

export function findGameFiles(folder: PickedFolder): {
  files: GameFolderFiles;
  keys: { master: string; critter: string; patch?: string };
  missing: string[];
} {
  const missing: string[] = [];
  const master = folder.files.get('master.dat');
  const critter = folder.files.get('critter.dat');
  const patch = folder.files.get('patch000.dat');
  if (!master) missing.push('MASTER.DAT');
  if (!critter) missing.push('CRITTER.DAT');

  const overlayFiles = new Map<string, () => Promise<Uint8Array>>();
  for (const [key, file] of folder.files) {
    if (key.startsWith('data/')) {
      overlayFiles.set(key.slice(5), async () => new Uint8Array(await readBlob(file)));
    }
  }
  const files = {
    // przy braku plikow wywolujacy ma missing.length > 0 i nie powinien ich uzywac
    master: fileSource(master ?? new File([], 'MASTER.DAT')),
    critter: fileSource(critter ?? new File([], 'CRITTER.DAT')),
    ...(patch ? { patch: fileSource(patch) } : {}),
    ...(overlayFiles.size > 0 ? { overlay: new MemoryLayer('data', overlayFiles) } : {}),
  } satisfies GameFolderFiles;
  const keys = {
    master: master ? cacheKey(master) : '',
    critter: critter ? cacheKey(critter) : '',
    ...(patch ? { patch: cacheKey(patch) } : {}),
  };
  return { files, keys, missing };
}

/** Warstwy modow z folderu gry w przegladarce (ddraw.ini + mods/mods_order.txt + mods/*.dat); null gdy brak modow. */
export async function openModLayersBrowser(folder: PickedFolder): Promise<ModLayers | null> {
  let hasMods = folder.files.has('ddraw.ini');
  if (!hasMods) {
    for (const k of folder.files.keys()) {
      if (k.startsWith('mods/')) {
        hasMods = true;
        break;
      }
    }
  }
  if (!hasMods) return null;

  const fs: ModFs = {
    async readDir(path) {
      const norm = path === '' ? '' : normalizeDatPath(path);
      const prefix = norm === '' ? '' : `${norm}/`;
      const out = new Map<string, ModFsEntry>();
      let any = norm === '';
      for (const k of folder.files.keys()) {
        if (!k.startsWith(prefix)) continue;
        any = true;
        const rest = k.slice(prefix.length);
        if (rest === '') continue;
        const i = rest.indexOf('/');
        if (i === -1) out.set(rest, { name: rest, kind: 'file' });
        else out.set(rest.slice(0, i), { name: rest.slice(0, i), kind: 'directory' });
      }
      return any ? [...out.values()] : undefined;
    },
    async readFile(path) {
      const f = folder.files.get(normalizeDatPath(path));
      if (!f) throw new Error(`brak pliku: ${path}`);
      return new Uint8Array(await readBlob(f));
    },
    async openSource(path) {
      const f = folder.files.get(normalizeDatPath(path));
      if (!f) throw new Error(`brak pliku: ${path}`);
      return fileSource(f);
    },
  };

  const readText = async (key: string): Promise<string | undefined> => {
    const f = folder.files.get(key);
    if (!f) return undefined;
    return new TextDecoder('latin1').decode(await readBlob(f));
  };

  const ini = await readText('ddraw.ini');
  const order = (await readText('mods/mods_order.txt')) ?? (await readText('mods_order.txt'));
  return buildModLayers(fs, {
    patchFiles: ini === undefined ? [] : parseDdrawIni(ini).patchFiles,
    modsOrder: order === undefined ? undefined : parseModsOrder(order),
  });
}
