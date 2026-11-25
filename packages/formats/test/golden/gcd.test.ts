import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { type FileHandle, open, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { readDat2Entry, readDat2Index } from '../../src/dat2/index.js';
import { parseBio, parseGcd } from '../../src/gcd/index.js';
import type { RandomAccessSource } from '../../src/io/source.js';

const dir = process.env.F2_GAME_DIR;
const handles: FileHandle[] = [];
afterAll(async () => {
  await Promise.all(handles.map((h) => h.close()));
});

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

const goldenPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../tests/golden/gcd.json',
);

async function loadAll(): Promise<Map<string, Uint8Array>> {
  const src = await fileSource(join(dir!, 'MASTER.DAT'));
  const idx = await readDat2Index(src);
  const out = new Map<string, Uint8Array>();
  for (const [name, e] of idx.byName) {
    if (/^premade\/.*\.(gcd|bio)$/i.test(name) || /\.gcd$/i.test(name)) {
      out.set(name, await readDat2Entry(src, e));
    }
  }
  return out;
}

describe.skipIf(!dir)('GCD golden', () => {
  it('parseGcd czyta 6 presetow poprawnie', async () => {
    const files = await loadAll();
    const gcds = [...files.keys()].filter((n) => n.endsWith('.gcd')).sort();
    expect(gcds.length).toBe(6);
    if (process.env.F2_GCD_WRITE) {
      const out: Record<string, unknown> = {};
      for (const n of gcds) {
        const buf = files.get(n)!;
        const g = parseGcd(buf);
        out[n] = {
          sha256: createHash('sha256').update(buf).digest('hex'),
          name: g.name,
          age: g.age,
          gender: g.gender,
          baseStats: g.baseStats,
          tags: g.tags,
          traits: g.traits,
          unspentSpecialPoints: g.unspentSpecialPoints,
        };
      }
      await writeFile(goldenPath, `${JSON.stringify(out, null, 2)}\n`);
    }
    for (const n of gcds) {
      const buf = files.get(n)!;
      expect(buf.length).toBe(432);
      const g = parseGcd(buf);
      expect(g.name.length).toBeGreaterThan(0);
      expect(g.baseStats).toHaveLength(7);
    }
    if (existsSync(goldenPath)) {
      const golden = JSON.parse(await readFile(goldenPath, 'utf8')) as Record<
        string,
        {
          sha256: string;
          name: string;
          age: number;
          gender: number;
          baseStats: number[];
          tags: number[];
          traits: number[];
          unspentSpecialPoints: number;
        }
      >;
      expect(Object.keys(golden).sort()).toEqual(gcds);
      for (const n of gcds) {
        const buf = files.get(n)!;
        const g = parseGcd(buf);
        const gold = golden[n]!;
        expect(createHash('sha256').update(buf).digest('hex')).toBe(gold.sha256);
        expect(g.name).toBe(gold.name);
      }
    }
  });
  it('parseBio czyta bio presetow', async () => {
    const files = await loadAll();
    const combat = parseBio(files.get('premade/combat.bio')!);
    expect(combat.toUpperCase()).toContain('NARG');
    expect(files.get('premade/combat.bio')!.length).toBe(367);
  });
});
