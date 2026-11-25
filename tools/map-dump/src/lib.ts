import { createHash } from 'node:crypto';
import { lstName, parseLst, parseMap, parseProto } from '@f2/formats';
import type { ParsedMap } from '@f2/formats';
import { openGameFolderNode } from '@f2/vfs/node';
import type { NodeVfs } from '@f2/vfs/node';

export const sha256 = (data: Uint8Array | string): string =>
  createHash('sha256').update(data).digest('hex');

/** Jeden wariant pliku w jednej warstwie VFS (overlay trzyma klucze `data/...`). */
export interface Variant {
  /** Sciezka znormalizowana (bez `data/`, male litery). */
  path: string;
  layer: number;
  layerName: string;
  key: string;
}

/** Wszystkie warianty plikow z danym prefiksem i rozszerzeniem, ze wszystkich warstw. */
export function listVariants(vfs: NodeVfs, prefix: string, ext: string): Variant[] {
  const out: Variant[] = [];
  vfs.layers.forEach((l, layer) => {
    for (const key of l.keys()) {
      const path = (key.startsWith('data/') ? key.slice(5) : key).toLowerCase();
      if (path.startsWith(prefix) && path.endsWith(ext))
        out.push({ path, layer, layerName: l.name, key });
    }
  });
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.layer - b.layer);
}

export function variantId(v: Variant): string {
  return `${v.layerName}:${v.path}`;
}

export async function openGame(): Promise<NodeVfs> {
  const game = process.env.F2_GAME_DIR;
  if (!game) throw new Error('brak F2_GAME_DIR');
  return openGameFolderNode(game, process.env.F2_PATCH_DIR);
}

/** Otwiera plik gry z uwzglednieniem priorytetu warstw (overlay `data/` > reszta). */
export async function openGameFile(vfs: NodeVfs, path: string): Promise<Uint8Array> {
  return vfs.resolve(`data/${path}`) ? vfs.open(`data/${path}`) : vfs.open(path);
}

export const PROTO_DIRS = ['items', 'critters', 'scenery', 'walls', 'tiles', 'misc'] as const;

export async function loadLst(vfs: NodeVfs, type: number): Promise<string[]> {
  const dir = PROTO_DIRS[type]!;
  return parseLst(await openGameFile(vfs, `proto/${dir}/${dir}.lst`)).map(lstName);
}

/** Synchroniczne subtypeOf(pid) dla parseMap (podtyp = u32 BE @0x20 w .pro). */
export async function buildSubtypeOf(vfs: NodeVfs): Promise<(pid: number) => number> {
  const table = new Map<number, number>();
  for (const type of [0, 2]) {
    const names = await loadLst(vfs, type);
    for (let i = 0; i < names.length; i++) {
      const name = names[i]!;
      if (name === '') continue;
      const pro = await openGameFile(vfs, `proto/${PROTO_DIRS[type]}/${name}`);
      const dv = new DataView(pro.buffer, pro.byteOffset, pro.byteLength);
      table.set(type * 0x1000000 + i + 1, dv.getUint32(0x20, false));
    }
  }
  return (pid) => {
    const v = table.get(pid);
    if (v === undefined) throw new Error(`brak prototypu pid ${pid.toString(16)}`);
    return v;
  };
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function parseMapBytes(bytes: Uint8Array, subtypeOf: (pid: number) => number): ParsedMap {
  return parseMap(toArrayBuffer(bytes), subtypeOf);
}

export interface MapGoldenEntry {
  sha256: string;
  size: number;
  objectCounts: number[];
  flags: number;
  headerSha256: string;
  error?: string;
}

export function mapGoldenEntry(
  bytes: Uint8Array,
  subtypeOf: (pid: number) => number,
): MapGoldenEntry {
  const base = { sha256: sha256(bytes), size: bytes.length };
  try {
    const m = parseMapBytes(bytes, subtypeOf);
    const entry: MapGoldenEntry = {
      ...base,
      objectCounts: m.objects.map((o) => o.length),
      flags: m.header.flags,
      headerSha256: sha256(JSON.stringify(m.header)),
    };
    if (m.endOffset !== bytes.length) entry.error = `endOffset ${m.endOffset} != ${bytes.length}`;
    return entry;
  } catch (e) {
    return { ...base, objectCounts: [], flags: 0, headerSha256: '', error: (e as Error).message };
  }
}

export async function buildMapGolden(vfs: NodeVfs): Promise<Record<string, MapGoldenEntry>> {
  const subtypeOf = await buildSubtypeOf(vfs);
  const out: Record<string, MapGoldenEntry> = {};
  for (const v of listVariants(vfs, 'maps/', '.map')) {
    out[variantId(v)] = mapGoldenEntry(await vfs.layers[v.layer]!.open(v.key), subtypeOf);
  }
  return out;
}

export interface ProGoldenEntry {
  sha256: string;
  size: number;
  pid: number;
  sizeMatchesSpec: boolean;
  headerSha256: string;
  error?: string;
}

/** parseProto sam sprawdza rozmiar wzgledem typu/podtypu, wiec sukces == zgodnosc ze spec. */
export function proGoldenEntry(bytes: Uint8Array): ProGoldenEntry {
  const base = { sha256: sha256(bytes), size: bytes.length };
  try {
    const p = parseProto(bytes);
    return { ...base, pid: p.pid, sizeMatchesSpec: true, headerSha256: sha256(JSON.stringify(p)) };
  } catch (e) {
    return {
      ...base,
      pid: -1,
      sizeMatchesSpec: false,
      headerSha256: '',
      error: (e as Error).message,
    };
  }
}

export async function buildProGolden(vfs: NodeVfs): Promise<Record<string, ProGoldenEntry>> {
  const out: Record<string, ProGoldenEntry> = {};
  for (const v of listVariants(vfs, 'proto/', '.pro')) {
    out[variantId(v)] = proGoldenEntry(await vfs.layers[v.layer]!.open(v.key));
  }
  return out;
}

/** JSON z jednym wpisem na linie (czytelne diffy). */
export function stringifyGolden(g: Record<string, unknown>): string {
  const lines = Object.entries(g).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  return `{\n${lines.join(',\n')}\n}\n`;
}
