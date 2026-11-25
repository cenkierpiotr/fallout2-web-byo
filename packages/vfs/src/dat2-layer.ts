import { normalizeDatPath, readDat2Entry, readDat2Index } from '@f2/formats';
import type { Dat2Index, RandomAccessSource } from '@f2/formats';
import type { VfsLayer } from './layer.js';

/** Zbuforowany indeks musi pasowac do zrodla: rozmiar pliku i granice wpisow. */
function isIndexValidFor(index: Dat2Index, src: RandomAccessSource): boolean {
  if (index.dataSize !== src.size) return false;
  return index.entries.every((e) => e.offset + e.packedSize <= src.size);
}

export class Dat2Layer implements VfsLayer {
  private constructor(
    readonly name: string,
    private readonly src: RandomAccessSource,
    readonly index: Dat2Index,
  ) {}

  static async open(name: string, src: RandomAccessSource, index?: Dat2Index): Promise<Dat2Layer> {
    const usable = index !== undefined && isIndexValidFor(index, src);
    return new Dat2Layer(name, src, usable ? index : await readDat2Index(src));
  }

  has(path: string): boolean {
    return this.index.byName.has(normalizeDatPath(path));
  }

  async open(path: string): Promise<Uint8Array> {
    const entry = this.index.byName.get(normalizeDatPath(path));
    if (!entry) throw new Error(`brak pliku: ${path}`);
    return readDat2Entry(this.src, entry);
  }

  keys(): Iterable<string> {
    return this.index.byName.keys();
  }
}
