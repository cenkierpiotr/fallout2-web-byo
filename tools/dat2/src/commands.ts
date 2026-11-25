import { normalizeDatPath, readDat2Entry, readDat2Index } from '@f2/formats';
import type { RandomAccessSource } from '@f2/formats';

export async function listDat(
  src: RandomAccessSource,
): Promise<{ lines: string[]; summary: string }> {
  const index = await readDat2Index(src);
  const lines = index.entries.map(
    (e) => `${e.name}\t${e.compressed ? 'zlib' : 'raw'}\t${e.unpackedSize}`,
  );
  const zlib = index.entries.filter((e) => e.compressed).length;
  const raw = index.entries.length - zlib;
  return { lines, summary: `${index.entries.length} entries, ${zlib} zlib, ${raw} raw` };
}

export async function extractDat(src: RandomAccessSource, name: string): Promise<Uint8Array> {
  const index = await readDat2Index(src);
  const entry = index.byName.get(normalizeDatPath(name));
  if (!entry) throw new Error(`brak wpisu: ${name}`);
  return readDat2Entry(src, entry);
}
