import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readDat2Entry, readDat2Index } from '../../src/dat2/index.js';
import type { RandomAccessSource } from '../../src/io/source.js';

const dir = process.env.F2_GAME_DIR;
const handles: FileHandle[] = [];

async function fileSource(path: string): Promise<RandomAccessSource> {
  const fh = await open(path, 'r');
  handles.push(fh);
  const { size } = await fh.stat();
  return {
    size,
    async read(offset, length) {
      const buf = new Uint8Array(length);
      const { bytesRead } = await fh.read(buf, 0, length, offset);
      return bytesRead === length ? buf : buf.subarray(0, bytesRead);
    },
  };
}

describe.skipIf(!dir)('DAT2 golden', () => {
  afterAll(async () => {
    await Promise.all(handles.map((h) => h.close()));
  });

  const cases: [string, number, number, number | null][] = [
    ['MASTER.DAT', 23120, 944018, 19543],
    ['CRITTER.DAT', 7120, 299044, null],
    ['PATCH000.DAT', 489, 17941, null],
  ];
  for (const [file, count, treeSize, zlibCount] of cases) {
    it(file, async () => {
      const idx = await readDat2Index(await fileSource(join(dir!, file)));
      expect(idx.entries.length).toBe(count);
      expect(idx.treeSize).toBe(treeSize);
      if (zlibCount !== null) {
        expect(idx.entries.filter((e) => e.compressed).length).toBe(zlibCount);
      }
    });
  }

  it('color.pal i EDG1001.FRM', async () => {
    const src = await fileSource(join(dir!, 'MASTER.DAT'));
    const idx = await readDat2Index(src);
    const pal = await readDat2Entry(src, idx.byName.get('color.pal')!);
    expect(pal.length).toBe(33536);
    expect(idx.byName.get('art/tiles/edg1001.frm')!.unpackedSize).toBe(2954);
  });

  // Dowod W dla kontraktu silnika (D: bsearch 0x4f1774 + stricmp 0x4dece6): indeks jest
  // posortowany rosnaco bez rozrozniania wielkosci liter ASCII, bez duplikatow,
  // a pole dataSize stopki rowna sie rozmiarowi pliku.
  const lower = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
  for (const file of ['MASTER.DAT', 'CRITTER.DAT', 'PATCH000.DAT']) {
    it(`${file}: wpisy scisle posortowane (stricmp), dataSize = rozmiar pliku`, async () => {
      const src = await fileSource(join(dir!, file));
      const idx = await readDat2Index(src);
      expect(idx.dataSize).toBe(src.size);
      for (let i = 1; i < idx.entries.length; i++) {
        const a = lower(idx.entries[i - 1]!.name);
        const b = lower(idx.entries[i]!.name);
        expect(a < b, `${a} < ${b}`).toBe(true);
      }
      expect(idx.entries.every((e) => e.name.length <= 34)).toBe(true);
    });
  }
});
