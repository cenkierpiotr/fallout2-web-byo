import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FormatError } from '../../src/errors.js';
import { lstName, parseLst } from '../../src/lst/index.js';
import {
  PROTO_ITEM_SIZES,
  ObjType,
  parseProto,
  pidIndex,
  pidType,
  subtypeOfPid,
} from '../../src/pro/index.js';
import { type NodeVfs, openGameFolderNode } from '../../../vfs/src/node.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;
const goldenPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../tests/golden/pro.json',
);
const TYPE_DIRS = ['items', 'critters', 'scenery', 'walls', 'tiles', 'misc'];

/**
 * Wszystkie warianty plikow PRO ze wszystkich warstw (MASTER 7650 + PATCH000 3 + overlay 32 = 7685;
 * 7652 unikalne sciezki). VFS trzyma overlay pod `data/`.
 */
function listPro(vfs: NodeVfs): { path: string; layer: number; key: string }[] {
  const out: { path: string; layer: number; key: string }[] = [];
  vfs.layers.forEach((l, layer) => {
    for (const key of l.keys()) {
      const path = key.startsWith('data/') ? key.slice(5) : key;
      if (path.startsWith('proto/') && path.endsWith('.pro')) out.push({ path, layer, key });
    }
  });
  return out.sort((x, y) => x.path.localeCompare(y.path) || x.layer - y.layer);
}

describe.skipIf(!dir || !patchDir)('PRO golden: wszystkie pliki', () => {
  it(
    'parsuje 7685 PRO, rozmiary zgodne ze spec, pid == linia lst',
    { timeout: 120_000 },
    async () => {
      const vfs = await openGameFolderNode(dir!, patchDir);
      try {
        const paths = listPro(vfs);
        const counts: Record<string, number> = {};
        const hash = createHash('sha256');
        const lsts: string[][] = [];
        for (let t = 0; t < 6; t++) {
          const lst = `proto/${TYPE_DIRS[t]}/${TYPE_DIRS[t]}.lst`;
          lsts.push(parseLst(await vfs.open(vfs.resolve(`data/${lst}`) ? `data/${lst}` : lst)));
        }
        const errors: string[] = [];
        let bytes = 0;
        for (const { path, layer, key } of paths) {
          const buf = await vfs.layers[layer]!.open(key);
          try {
            const p = parseProto(buf);
            const d = path.split('/')[1]!;
            if (TYPE_DIRS[pidType(p.pid)] !== d) errors.push(`${path}: katalog != typ`);
            if (pidType(p.fid) !== p.type) errors.push(`${path}: fid typ`);
            if (p.textId !== p.index * 100) errors.push(`${path}: textId`);
            if (p.lightDistance > 8 || p.lightIntensity > 65536) errors.push(`${path}: swiatlo`);
            if (p.kind === 'item' && PROTO_ITEM_SIZES[subtypeOfPid(buf)]!.size !== buf.length)
              errors.push(`${path}: podtyp`);
            const name = lstName(lsts[p.type]![p.index - 1] ?? '').toLowerCase();
            if (name === '') errors.push(`${path}: brak w lst`);
            bytes += buf.length;
            const key = 'subtype' in p ? `${p.kind}:${p.subtype}` : p.kind;
            counts[key] = (counts[key] ?? 0) + 1;
            hash.update(JSON.stringify(p));
          } catch (e) {
            errors.push(`${path}: ${e instanceof FormatError ? e.message : String(e)}`);
          }
        }
        const actual = {
          total: paths.length,
          bytes,
          counts: Object.fromEntries(Object.entries(counts).sort()),
          sha256: hash.digest('hex'),
        };
        if (process.env.F2_WRITE_GOLDEN)
          await writeFile(goldenPath, `${JSON.stringify(actual, null, 2)}\n`);
        expect(errors).toEqual([]);
        expect(paths).toHaveLength(7685);
        expect(JSON.parse(await readFile(goldenPath, 'utf8'))).toEqual(actual);
      } finally {
        await vfs.close();
      }
    },
  );

  it('critter 00000029: pid 0x0100001D, 416 B zuzyte w calosci', async () => {
    const vfs = await openGameFolderNode(dir!, patchDir);
    try {
      const buf = await vfs.open('proto/critters/00000029.pro');
      expect(buf.length).toBe(416);
      const p = parseProto(buf);
      expect(p.type).toBe(ObjType.Critter);
      expect(p.pid).toBe(0x0100001d);
      expect(p.index).toBe(29);
      expect(p.textId).toBe(0xb54);
      expect(p.fid).toBe(0x01000021);
    } finally {
      await vfs.close();
    }
  });

  it.skipIf(!patchDir)(
    'itemy z overlay o rozmiarach 69/122/125 maja podtyp zgodny z rozmiarem',
    async () => {
      const vfs = await openGameFolderNode(dir!, patchDir);
      try {
        const seen = new Set<number>();
        for (const path of vfs.list('proto/items').filter((p) => p.endsWith('.pro'))) {
          const buf = await vfs.open(path);
          const p = parseProto(buf);
          if (p.kind !== 'item') throw new Error('nie item');
          expect(PROTO_ITEM_SIZES[p.subtype]!.size).toBe(buf.length);
          seen.add(buf.length);
        }
        for (const s of [69, 122, 125]) expect(seen.has(s), `rozmiar ${s}`).toBe(true);
        expect(pidIndex(0x0100001d)).toBe(29);
      } finally {
        await vfs.close();
      }
    },
  );
});
