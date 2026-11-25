import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MveDecoder } from '../../src/mve-decoder.js';

const dir = process.env.F2_MVE_DIR;
const run = dir && existsSync(join(dir, 'IPLOGO.mve')) ? describe : describe.skip;

run('MveDecoder golden (F2_MVE_DIR)', () => {
  for (const [name, frames] of [
    ['IPLOGO', 230],
    ['elder', 1156],
  ] as const) {
    it(`${name}: ${frames} klatek, error null, 640 px`, { timeout: 120_000 }, () => {
      const d = new MveDecoder(new Uint8Array(readFileSync(join(dir!, `${name}.mve`))));
      let n = 0;
      while (d.nextFrame()) n++;
      expect(d.error).toBeNull();
      expect(n).toBe(frames);
      expect(d.width).toBe(640);
    });
  }

  // Skroty (sha256, 16 hex) pelnych klatek RGBA. Obraz zweryfikowany piksel w piksel
  // z niezaleznym dekoderem referencyjnym (ffmpeg): elder 1145 klatek, derrick 900, IPLOGO 230, 0 roznic.
  const hashes: [string, number, string][] = [
    ['elder', 0, 'ab36b15671acf45d'],
    ['elder', 1, '48af29081d658cfd'],
    ['elder', 5, '6349388d8d51e826'],
    ['elder', 31, 'ad24a7c1b4491bb4'],
    ['elder', 39, '1d0e5ac4fcd6e1e7'],
    ['elder', 500, '5466ba2a4419bd64'],
    ['elder', 1000, '1b0bce398b098e40'],
    ['IPLOGO', 0, 'b4007e8206dabeec'],
    ['IPLOGO', 100, '15daed32214f57df'],
    ['IPLOGO', 229, '10f4d37bc929077c'],
  ];
  for (const name of ['elder', 'IPLOGO']) {
    it(
      `${name}: skroty pikseli klatek referencyjnych (regresja szumu w malych blokach)`,
      { timeout: 120_000 },
      () => {
        const want = new Map(hashes.filter((h) => h[0] === name).map((h) => [h[1], h[2]]));
        const d = new MveDecoder(new Uint8Array(readFileSync(join(dir!, `${name}.mve`))));
        const got = new Map<number, string>();
        for (let f = d.nextFrame(); f; f = d.nextFrame()) {
          if (want.has(f.index))
            got.set(f.index, createHash('sha256').update(f.rgba).digest('hex').slice(0, 16));
        }
        expect(Object.fromEntries(got)).toEqual(Object.fromEntries(want));
      },
    );
  }
});
