import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { iterateMveRecords } from '../../src/mve/mve-chunks.js';

const dir = process.env.F2_MVE_DIR;
const run = dir && existsSync(join(dir, 'IPLOGO.mve')) ? describe : describe.skip;

run('MVE golden (F2_MVE_DIR)', () => {
  for (const [name, frames] of [
    ['IPLOGO', 230],
    ['elder', 1156],
  ] as const) {
    it(`${name}: ${frames} klatek, bez ucięcia`, () => {
      const recs = [...iterateMveRecords(new Uint8Array(readFileSync(join(dir!, `${name}.mve`))))];
      expect(recs.filter((r) => r.type === 3)).toHaveLength(frames);
      expect(recs.some((r) => r.truncated)).toBe(false);
    });
  }
});
