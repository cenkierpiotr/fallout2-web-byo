import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FormatError } from '../../src/errors.js';
import { parseMsg } from '../../src/msg.js';
import { openGameFolderNode } from '../../../vfs/src/node.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;
const goldenPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../tests/golden/msg.json',
);

describe.skipIf(!dir || !patchDir)('MSG golden: wszystkie pliki ze wszystkich warstw', () => {
  it('parsuje wszystkie .msg bez bledow gramatyki', { timeout: 120_000 }, async () => {
    const vfs = await openGameFolderNode(dir!, patchDir);
    try {
      const files: { path: string; layer: number; key: string }[] = [];
      vfs.layers.forEach((l, layer) => {
        for (const key of l.keys()) {
          const path = key.startsWith('data/') ? key.slice(5) : key;
          if (path.startsWith('text/') && path.endsWith('.msg')) files.push({ path, layer, key });
        }
      });
      files.sort((a, b) => a.path.localeCompare(b.path) || a.layer - b.layer);
      const errors: string[] = [];
      const hash = createHash('sha256');
      let entries = 0;
      let uniquePaths = 0;
      let prev = '';
      for (const { path, layer, key } of files) {
        if (path !== prev) uniquePaths++;
        prev = path;
        const b = await vfs.layers[layer]!.open(key);
        try {
          const m = parseMsg(
            b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
          );
          entries += m.size;
          hash.update(JSON.stringify([path, [...m.values()]]));
        } catch (e) {
          errors.push(`${path}: ${e instanceof FormatError ? e.message : String(e)}`);
        }
      }
      const actual = { files: files.length, uniquePaths, entries, sha256: hash.digest('hex') };
      if (process.env.F2_WRITE_GOLDEN)
        await writeFile(goldenPath, `${JSON.stringify(actual, null, 2)}\n`);
      expect(errors).toEqual([]);
      expect(JSON.parse(await readFile(goldenPath, 'utf8'))).toEqual(actual);
    } finally {
      await vfs.close();
    }
  });
});
