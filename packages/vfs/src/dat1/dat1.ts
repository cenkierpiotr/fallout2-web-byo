import { FormatError, normalizeDatPath } from '@f2/formats';
import type { RandomAccessSource } from '@f2/formats';
import type { VfsLayer } from '../layer.js';
import { lzssDecompress } from './lzss.js';

export class Dat1FormatError extends FormatError {
  constructor(message: string, offset?: number) {
    super('DAT1', message, offset);
    this.name = 'Dat1FormatError';
  }
}

export interface Dat1Entry {
  name: string;
  offset: number;
  size: number;
  packedSize: number;
  compressed: boolean;
}

export interface Dat1Index {
  entries: Dat1Entry[];
  byName: Map<string, Dat1Entry>;
}

const u32 = (b: Uint8Array, o: number): number =>
  ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;

/**
 * Indeks DAT1 (Fallout 1, big-endian): naglowek 16 B, lista nazw katalogow (u8 len + nazwa),
 * potem dla kazdego katalogu: u32 liczba plikow + 3 x u32, wpisy (u8 len, nazwa, attr, offset, size, packed).
 * attr 0x40 = LZSS, 0x20 = surowy. Tabele czytane jednym blokiem (siegaja poczatku danych).
 */
export async function readDat1Index(src: RandomAccessSource): Promise<Dat1Index> {
  if (src.size < 16) throw new Dat1FormatError('plik za maly', 0);
  const tail = await src.read(src.size - 4, 4);
  // MASTER.DAT z Fallout 2 (DAT2) konczy sie rozmiarem pliku (LE)
  if ((tail[0]! | (tail[1]! << 8) | (tail[2]! << 16) | (tail[3]! << 24)) >>> 0 === src.size) {
    throw new Dat1FormatError('to jest DAT2 (stopka z rozmiarem pliku), nie DAT1', src.size - 4);
  }
  const head = await src.read(0, 16);
  const dirCount = u32(head, 0);
  if (dirCount === 0 || dirCount > 65535) {
    throw new Dat1FormatError(`niepoprawna liczba katalogow: ${dirCount}`, 0);
  }
  // Tabele zajmuja zwykle < 2 MB; czytamy porcjami, rosnac w miare potrzeby.
  let tableLen = Math.min(src.size - 16, 1 << 20);
  for (;;) {
    const buf = await src.read(16, tableLen);
    const r = tryParse(buf, dirCount);
    if (r) return r;
    if (tableLen >= src.size - 16) throw new Dat1FormatError('tabela katalogow ucieta', 16);
    tableLen = Math.min(src.size - 16, tableLen * 4);
  }
}

/** null = za malo danych (czytaj wiecej); wyjatek = dane niepoprawne. */
function tryParse(b: Uint8Array, dirCount: number): Dat1Index | null {
  let p = 0;
  const ascii = (len: number): string => {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(b[p + i]!);
    return s;
  };
  const dirs: string[] = [];
  for (let d = 0; d < dirCount; d++) {
    if (p >= b.length) return null;
    const len = b[p++]!;
    if (len === 0) throw new Dat1FormatError('pusta nazwa katalogu', 16 + p - 1);
    if (p + len > b.length) return null;
    dirs.push(ascii(len));
    p += len;
  }
  const entries: Dat1Entry[] = [];
  const byName = new Map<string, Dat1Entry>();
  for (const dir of dirs) {
    if (p + 16 > b.length) return null;
    const count = u32(b, p);
    p += 16;
    for (let f = 0; f < count; f++) {
      if (p >= b.length) return null;
      const len = b[p++]!;
      if (len === 0) throw new Dat1FormatError('pusta nazwa pliku', 16 + p - 1);
      if (p + len + 16 > b.length) return null;
      const fname = ascii(len);
      p += len;
      const attr = u32(b, p);
      const offset = u32(b, p + 4);
      const size = u32(b, p + 8);
      const packedSize = u32(b, p + 12);
      p += 16;
      const compressed = (attr & 0x40) !== 0;
      const name = normalizeDatPath(dir === '.' ? fname : `${dir}\\${fname}`);
      const e: Dat1Entry = {
        name,
        offset,
        size,
        packedSize: compressed ? packedSize : size,
        compressed,
      };
      entries.push(e);
      byName.set(name, e);
    }
  }
  return { entries, byName };
}

export async function extractDat1Entry(
  src: RandomAccessSource,
  entry: Dat1Entry,
): Promise<Uint8Array> {
  if (entry.offset + entry.packedSize > src.size) {
    throw new Dat1FormatError(`wpis ${entry.name} poza plikiem`, entry.offset);
  }
  const raw = await src.read(entry.offset, entry.packedSize);
  if (!entry.compressed) return raw;
  return lzssDecompress(raw, entry.size);
}

export class Dat1Layer implements VfsLayer {
  private constructor(
    readonly name: string,
    private readonly src: RandomAccessSource,
    readonly index: Dat1Index,
  ) {}

  static async open(name: string, src: RandomAccessSource): Promise<Dat1Layer> {
    return new Dat1Layer(name, src, await readDat1Index(src));
  }

  has(path: string): boolean {
    return this.index.byName.has(normalizeDatPath(path));
  }

  async open(path: string): Promise<Uint8Array> {
    const e = this.index.byName.get(normalizeDatPath(path));
    if (!e) throw new Error(`brak pliku: ${path}`);
    return extractDat1Entry(this.src, e);
  }

  keys(): Iterable<string> {
    return this.index.byName.keys();
  }
}
