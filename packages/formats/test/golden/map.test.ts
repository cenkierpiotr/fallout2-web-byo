import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseMap } from '../../src/map.js';
import { buildSubtypeOf } from './map-subtype.js';
import { openGameFolderNode } from '../../../vfs/src/node.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;
const goldenPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../tests/golden/map.json',
);
const GOLDEN_MAPS = ['artemple.map', 'arvillag.map'];

type Golden = Record<string, { sha256: string; objectCounts: number[]; flags: number }>;

describe.skipIf(!dir || !patchDir)('MAP golden', () => {
  it('parsuje 155 unikalnych map do konca pliku', { timeout: 300_000 }, async () => {
    const vfs = await openGameFolderNode(dir!, patchDir);
    try {
      const subtypeOf = await buildSubtypeOf(vfs);
      const maps = vfs.list('maps').filter((p) => p.toLowerCase().endsWith('.map'));
      expect(maps.length).toBe(155);
      const errors: string[] = [];
      for (const path of maps) {
        const bytes = await vfs.open(path);
        const buf = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        try {
          const m = parseMap(buf, subtypeOf);
          if (m.endOffset !== buf.byteLength)
            errors.push(`${path}: endOffset ${m.endOffset} != ${buf.byteLength}`);
        } catch (e) {
          errors.push(`${path}: ${(e as Error).message}`);
        }
      }
      expect(errors).toEqual([]);
    } finally {
      await vfs.close();
    }
  });

  it(
    'zgodnosc z tests/golden/map.json (MASTER/PATCH000, bez overlay)',
    { timeout: 60_000 },
    async () => {
      // golden dotyczy plikow z DAT-ow; overlay (DATA/) nadpisuje czesc map, wiec otwieramy bez niego
      const vfs = await openGameFolderNode(dir!);
      try {
        const subtypeOf = await buildSubtypeOf(vfs);
        const actual: Golden = {};
        for (const name of GOLDEN_MAPS) {
          const bytes = await vfs.open(`maps/${name}`);
          const buf = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
          const m = parseMap(buf, subtypeOf);
          actual[name] = {
            sha256: createHash('sha256').update(bytes).digest('hex'),
            objectCounts: m.objects.map((o) => o.length),
            flags: m.header.flags,
          };
        }
        if (process.env.F2_WRITE_GOLDEN)
          await writeFile(goldenPath, JSON.stringify(actual, null, 2) + '\n');
        const golden = JSON.parse(await readFile(goldenPath, 'utf8')) as Golden;
        expect(actual).toEqual(golden);
      } finally {
        await vfs.close();
      }
    },
  );
});
