import { open, readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { RandomAccessSource } from '@f2/formats';
import { openGameFolder } from './game-folder.js';
import type { VfsLayer } from './layer.js';
import { MemoryLayer } from './memory-layer.js';
import { parseDdrawIni } from './mods/ddraw-ini.js';
import { buildModLayers } from './mods/mod-layers.js';
import type { ModFs, ModFsEntry, ModLayers } from './mods/mod-layers.js';
import { parseModsOrder } from './mods/mods-order.js';
import type { VirtualFs } from './vfs.js';

/** VirtualFs z jawnym zamknieciem uchwytow plikow DAT. */
export type NodeVfs = VirtualFs & { close(): Promise<void> };

export type NodeFileSource = RandomAccessSource & { close(): Promise<void> };

/** Zrodlo dostepu swobodnego nad plikiem w Node. Wywolujacy musi wywolac close(). */
export async function nodeFileSource(path: string): Promise<NodeFileSource> {
  const file = await open(path, 'r');
  let closed = false;
  try {
    const { size } = await file.stat();
    return {
      size,
      async read(offset, length) {
        if (closed) throw new Error('plik zamkniety');
        const buf = new Uint8Array(length);
        const { bytesRead } = await file.read(buf, 0, length, offset);
        return bytesRead === length ? buf : buf.subarray(0, bytesRead);
      },
      async close() {
        if (closed) return;
        closed = true;
        await file.close();
      },
    };
  } catch (e) {
    await file.close();
    throw e;
  }
}

async function findCaseInsensitive(dir: string, name: string): Promise<string | undefined> {
  const found = (await readdir(dir)).find((e) => e.toLowerCase() === name);
  return found === undefined ? undefined : join(dir, found);
}

/**
 * Warstwa overlay z katalogu instalacji patcha/moda (F2_PATCH_DIR) albo katalogu DATA.
 * Rozpoznaje uklad: (a) katalog DATA gry wsposob — pliki ladowane jako text/..., maps/...,
 * (b) korzen instalacji z podkatalogiem DATA — pliki DATA/* ladowane tak samo,
 * (c) data/data (UP) — pliki ladowane pod data/... (zgodnosc z extractorem DAT i UP).
 * Filtr: tylko sciezki przydatne silnikowi (data/** zostaje data/...).
 */
async function overlayLayer(overlayDir: string): Promise<VfsLayer> {
  const files = new Map<string, () => Promise<Uint8Array>>();
  // (a/b) overlayDir moze byc samym katalogiem DATA (basename) albo korzeniem instalacji z DATA/ w srodku.
  const isDataDir = basename(overlayDir).toLowerCase() === 'data';
  const root = isDataDir ? overlayDir : await findCaseInsensitive(overlayDir, 'data');
  if (!root) return new MemoryLayer('overlay', files);

  const isGamePath = (key: string): boolean =>
    key === 'worldmap.dat' || key.startsWith('data/') || /^[a-z]+\//.test(key);

  const walk = async (abs: string, rel: string): Promise<void> => {
    for (const e of await readdir(abs, { withFileTypes: true })) {
      const a = join(abs, e.name);
      const r = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(a, r);
      else if (e.isFile()) {
        const key = r.toLowerCase();
        if (!isGamePath(key)) continue;
        files.set(key, async () => new Uint8Array(await readFile(a)));
      }
    }
  };
  await walk(root, '');

  return new MemoryLayer('overlay', files);
}

/** Otwiera folder gry (master/critter/patch000 bez wzgledu na wielkosc liter). Uchwyty zyja z VFS. */
export async function openGameFolderNode(dir: string, overlayDir?: string): Promise<NodeVfs> {
  const [master, critter, patch] = await Promise.all([
    findCaseInsensitive(dir, 'master.dat'),
    findCaseInsensitive(dir, 'critter.dat'),
    findCaseInsensitive(dir, 'patch000.dat'),
  ]);
  if (!master) throw new Error('brak pliku: MASTER.DAT');
  if (!critter) throw new Error('brak pliku: CRITTER.DAT');
  const opened: NodeFileSource[] = [];
  try {
    const open = async (p: string): Promise<NodeFileSource> => {
      const s = await nodeFileSource(p);
      opened.push(s);
      return s;
    };
    const m = await open(master);
    const c = await open(critter);
    const p = patch ? await open(patch) : undefined;
    const overlay = overlayDir ? await overlayLayer(overlayDir) : undefined;
    const vfs = await openGameFolder({
      master: m,
      critter: c,
      ...(p ? { patch: p } : {}),
      ...(overlay ? { overlay } : {}),
    });
    const close = async (): Promise<void> => {
      await Promise.all(opened.map((s) => s.close().catch(() => undefined)));
    };
    return Object.assign(vfs, { close });
  } catch (e) {
    await Promise.all(opened.map((s) => s.close().catch(() => undefined)));
    throw e;
  }
}

/** ModFs nad katalogiem gry w Node (sciezki wzgledne, `/`). */
export function nodeModFs(root: string): ModFs {
  const abs = (p: string): string => (p === '' ? root : join(root, ...p.split('/')));
  return {
    async readDir(path) {
      try {
        const out: ModFsEntry[] = [];
        for (const e of await readdir(abs(path), { withFileTypes: true })) {
          if (e.isDirectory()) out.push({ name: e.name, kind: 'directory' });
          else if (e.isFile()) out.push({ name: e.name, kind: 'file' });
        }
        return out;
      } catch {
        return undefined;
      }
    },
    async readFile(path) {
      return new Uint8Array(await readFile(abs(path)));
    },
    openSource: (path) => nodeFileSource(abs(path)),
  };
}

async function readTextCi(fs: ModFs, dir: string, name: string): Promise<string | undefined> {
  const hit = (await fs.readDir(dir))?.find(
    (e) => e.kind === 'file' && e.name.toLowerCase() === name,
  );
  if (!hit) return undefined;
  return new TextDecoder('latin1').decode(
    await fs.readFile(dir === '' ? hit.name : `${dir}/${hit.name}`),
  );
}

/**
 * Warstwy modow dla folderu gry: ddraw.ini (PatchFile) w korzeniu, mods_order.txt w mods/
 * (potem w korzeniu). Wywolujacy zamyka wynik (close()).
 */
export async function openModLayersNode(gameDir: string): Promise<ModLayers> {
  const fs = nodeModFs(gameDir);
  const ini = await readTextCi(fs, '', 'ddraw.ini');
  const modsDirEntry = (await fs.readDir(''))?.find(
    (e) => e.kind === 'directory' && e.name.toLowerCase() === 'mods',
  );
  const order =
    (modsDirEntry ? await readTextCi(fs, modsDirEntry.name, 'mods_order.txt') : undefined) ??
    (await readTextCi(fs, '', 'mods_order.txt'));
  return buildModLayers(fs, {
    patchFiles: ini === undefined ? [] : parseDdrawIni(ini).patchFiles,
    modsOrder: order === undefined ? undefined : parseModsOrder(order),
  });
}
