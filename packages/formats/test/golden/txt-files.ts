import { type FileHandle, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readDat2Entry, readDat2Index } from '../../src/dat2/index.js';
import type { RandomAccessSource } from '../../src/io/source.js';

export const gameDir = process.env.F2_GAME_DIR;
export const patchDir = process.env.F2_PATCH_DIR;

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return s;
}

/** Tekst pliku z MASTER.DAT (sciezka wewnatrz DAT, np. `data/genrep.txt`). */
export async function readMasterText(name: string): Promise<string> {
  const fh: FileHandle = await open(join(gameDir!, 'MASTER.DAT'), 'r');
  try {
    const { size } = await fh.stat();
    const src: RandomAccessSource = {
      size,
      async read(offset, length) {
        const buf = new Uint8Array(length);
        const { bytesRead } = await fh.read(buf, 0, length, offset);
        return bytesRead === length ? buf : buf.subarray(0, bytesRead);
      },
    };
    const idx = await readDat2Index(src);
    const e = idx.byName.get(name);
    if (!e) throw new Error(`brak ${name} w MASTER.DAT`);
    return latin1(await readDat2Entry(src, e));
  } finally {
    await fh.close();
  }
}

/** Plik z overlayu patcha: `<F2_PATCH_DIR>/DATA/Data/<name>`. */
export async function readPatchText(name: string): Promise<string> {
  return latin1(await readFile(join(patchDir!, 'DATA', 'Data', name)));
}
