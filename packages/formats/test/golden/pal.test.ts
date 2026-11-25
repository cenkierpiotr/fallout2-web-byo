import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDat2Entry, readDat2Index } from '../../src/dat2/index.js';
import { parsePal } from '../../src/pal/index.js';

const dir = process.env.F2_GAME_DIR;

describe.skipIf(!dir)('PAL golden', () => {
  it('color.pal z MASTER.DAT', async () => {
    const fh = await open(join(dir!, 'MASTER.DAT'), 'r');
    try {
      const { size } = await fh.stat();
      const src = {
        size,
        async read(offset: number, length: number) {
          const buf = new Uint8Array(length);
          const { bytesRead } = await fh.read(buf, 0, length, offset);
          return bytesRead === length ? buf : buf.subarray(0, bytesRead);
        },
      };
      const idx = await readDat2Index(src);
      const pal = parsePal(await readDat2Entry(src, idx.byName.get('color.pal')!));
      expect(pal.lookup15.length).toBe(32768);
      expect(pal.special.reduce((s, v) => s + v, 0)).toBe(28);
      const expectedSpecial = new Set([0, ...Array.from({ length: 27 }, (_, k) => 229 + k)]);
      for (let i = 0; i < 256; i++) {
        expect(pal.special[i], `special[${i}]`).toBe(expectedSpecial.has(i) ? 1 : 0);
      }
      expect(Array.from(pal.rgba.slice(229 * 4, 229 * 4 + 3))).toEqual([255, 255, 255]);
      expect(Array.from(pal.rgba.slice(255 * 4, 255 * 4 + 3))).toEqual([255, 255, 255]);
      expect(pal.rgba[1 * 4]).toBe(0x3b * 4);
      // tablica 15-bit (R w bitach 14..10): wskazuje tylko indeksy zwykle (< 229)
      expect(Math.max(...pal.lookup15)).toBeLessThan(229);
      const lum = (i: number) => pal.rgba[i * 4]! + pal.rgba[i * 4 + 1]! + pal.rgba[i * 4 + 2]!;
      expect(lum(pal.lookup15[0]!)).toBeLessThan(60); // czern
      expect(lum(pal.lookup15[32767]!)).toBeGreaterThan(600); // biel
      const red = pal.lookup15[31 << 10]!; // czysty czerwony
      expect(pal.rgba[red * 4]!).toBeGreaterThan(pal.rgba[red * 4 + 1]! + 60);
      expect(pal.rgba[red * 4]!).toBeGreaterThan(pal.rgba[red * 4 + 2]! + 60);
    } finally {
      await fh.close();
    }
  });
});
