import { inflateZlib } from '../compress/inflate.js';
import { FormatError } from '../errors.js';
import { ByteReader } from '../io/reader.js';
import type { RandomAccessSource } from '../io/source.js';

export interface Dat2Entry {
  name: string;
  compressed: boolean;
  unpackedSize: number;
  packedSize: number;
  offset: number;
}

export interface Dat2Index {
  treeSize: number;
  dataSize: number;
  entries: Dat2Entry[];
  byName: Map<string, Dat2Entry>;
}

export function normalizeDatPath(p: string): string {
  const q = (p.includes('\\') ? p.replace(/\\/g, '/') : p).toLowerCase();
  return q.charCodeAt(0) === 47 ? q.replace(/^\/+/, '') : q;
}

export function parseDat2Footer(last8: Uint8Array): { treeSize: number; dataSize: number } {
  if (last8.length !== 8) {
    throw new FormatError('dat2', `stopka ma dlugosc ${last8.length}, oczekiwano 8`);
  }
  const r = new ByteReader(last8);
  return { treeSize: r.u32le(), dataSize: r.u32le() };
}

/** Minimalny wpis: nameLen(4) + compressed(1) + 3 x u32(12). */
const MIN_ENTRY = 17;

export function parseDat2Tree(tree: Uint8Array): Dat2Entry[] {
  const r = new ByteReader(tree);
  const count = r.u32le();
  if (count * MIN_ENTRY > r.remaining) {
    throw new FormatError('dat2', `zbyt duza liczba wpisow: ${count}`, 0);
  }
  const entries: Dat2Entry[] = [];
  for (let i = 0; i < count; i++) {
    const nameLen = r.u32le();
    if (nameLen + 13 > r.remaining) {
      throw new FormatError('dat2', `nazwa wpisu ${i} wykracza poza drzewo (${nameLen} B)`, r.pos);
    }
    const nameBytes = r.bytes(nameLen);
    // jedno wywolanie zamiast konkatenacji znak po znaku (nazwy maja <= ~100 B, bezpieczne dla apply)
    const name = String.fromCharCode.apply(null, nameBytes as unknown as number[]);
    const flag = r.u8();
    if (flag !== 0 && flag !== 1) {
      throw new FormatError('dat2', `wpis ${i}: nieprawidlowa flaga compressed=${flag}`, r.pos);
    }
    const unpackedSize = r.u32le();
    const packedSize = r.u32le();
    const offset = r.u32le();
    entries.push({ name, compressed: flag === 1, unpackedSize, packedSize, offset });
  }
  if (r.remaining !== 0) {
    throw new FormatError(
      'dat2',
      `po ${count} wpisach zostalo ${r.remaining} nieuzytych bajtow drzewa`,
      r.pos,
    );
  }
  return entries;
}

export async function readDat2Index(src: RandomAccessSource): Promise<Dat2Index> {
  const size = src.size;
  if (size < 12) {
    throw new FormatError('dat2', `plik za maly (${size} B)`);
  }
  const { treeSize, dataSize } = parseDat2Footer(await src.read(size - 8, 8));
  if (dataSize !== size) {
    throw new FormatError(
      'dat2',
      `dataSize w stopce (${dataSize}) != rozmiar pliku (${size}); plik obciety?`,
    );
  }
  if (treeSize < 4 || treeSize + 8 > size) {
    throw new FormatError('dat2', `nieprawidlowy treeSize ${treeSize} (plik ${size} B)`);
  }
  const treeOffset = size - 8 - treeSize;
  const entries = parseDat2Tree(await src.read(treeOffset, treeSize));
  const byName = new Map<string, Dat2Entry>();
  for (const e of entries) {
    if (e.offset + e.packedSize > treeOffset) {
      throw new FormatError(
        'dat2',
        `wpis '${e.name}' wykracza poza dane (offset=${e.offset}, packedSize=${e.packedSize}, koniec danych=${treeOffset})`,
      );
    }
    if (!e.compressed && e.packedSize !== e.unpackedSize) {
      throw new FormatError(
        'dat2',
        `wpis raw '${e.name}': packedSize ${e.packedSize} != unpackedSize ${e.unpackedSize}`,
      );
    }
    byName.set(normalizeDatPath(e.name), e);
  }
  return { treeSize, dataSize, entries, byName };
}

/** Maksymalny rozmiar rozpakowanego wpisu (ochrona przed zip-bomb): 256 MiB. */
export const MAX_UNPACKED_SIZE = 256 * 1024 * 1024;

export async function readDat2Entry(src: RandomAccessSource, e: Dat2Entry): Promise<Uint8Array> {
  if (e.unpackedSize > MAX_UNPACKED_SIZE) {
    throw new FormatError(
      'dat2',
      `wpis '${e.name}': rozmiar po rozpakowaniu ${e.unpackedSize} B przekracza limit 256 MiB (zbyt duzy)`,
    );
  }
  const chunk = await src.read(e.offset, e.packedSize);
  if (chunk.length !== e.packedSize) {
    throw new FormatError(
      'dat2',
      `wpis '${e.name}': odczytano ${chunk.length} B zamiast ${e.packedSize}`,
    );
  }
  if (e.compressed) return inflateZlib(chunk, e.unpackedSize);
  return chunk.slice();
}
