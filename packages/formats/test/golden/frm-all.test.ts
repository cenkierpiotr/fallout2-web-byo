import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readDat2Index } from '../../src/dat2/index.js';
import { frmExtensionDirection, parseFrm } from '../../src/frm/index.js';
import { frameToRgba } from '../../src/frm/to-rgba.js';
import { parsePal } from '../../src/pal/index.js';
import { nodeFileSource, openGameFolderNode } from '../../../vfs/src/node.js';
import { walkAllFrm } from './frm-walk.js';

const dir = process.env.F2_GAME_DIR;

describe.skipIf(!dir)('FRM golden: wszystkie pliki', () => {
  it('parsuje 15190 FRM z MASTER + CRITTER bez bledow', { timeout: 480_000 }, async () => {
    const masterSrc = await nodeFileSource(join(dir!, 'MASTER.DAT'));
    const critterSrc = await nodeFileSource(join(dir!, 'CRITTER.DAT'));
    try {
      const layers = [
        { name: 'master', index: await readDat2Index(masterSrc), src: masterSrc },
        { name: 'critter', index: await readDat2Index(critterSrc), src: critterSrc },
      ];
      const t0 = Date.now();
      const result = await walkAllFrm(layers, () => {});
      const ms = Date.now() - t0;
      if (process.env.F2_FRM_REPORT) {
        await mkdir(join(process.env.F2_FRM_REPORT, '..'), { recursive: true });
        await writeFile(
          process.env.F2_FRM_REPORT,
          JSON.stringify({ total: result.total, ok: result.ok, errors: result.errors, ms }),
        );
      }
      expect(result.errors).toEqual([]);
      expect(result.total).toBe(15190);
      expect(result.ok).toBe(15190);
      // Budzet czasu: pod obciazeniem (load ~50, inne sesje) zmierzono 188 s, wiec 120 s padalo bez bledu kodu.
      // Limit 300 s nadal lapie wyrazna regresje wydajnosci parsera (ponad 1,5x ponad pomiar pod obciazeniem),
      // ale nie pada przez szum obciazenia; asercje poprawnosci (errors/total/ok) bez zmian.
      expect(ms).toBeLessThan(300_000);
    } finally {
      await masterSrc.close();
      await critterSrc.close();
    }
  });

  // Ta sama logika co `frm2png --write-golden` (tools/frm2png/src/cli.ts):
  // pierwsza klatka kierunku z rozszerzenia (domyslnie 0), RGBA wg color.pal.
  it('zgodnosc z tests/golden/frm.json (sha256 + metadane)', { timeout: 120_000 }, async () => {
    const goldenPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../tests/golden/frm.json',
    );
    const golden = JSON.parse(await readFile(goldenPath, 'utf8')) as Record<
      string,
      {
        sha256: string;
        width: number;
        height: number;
        fps: number;
        framesPerDirection: number;
        distinctDirections: number;
      }
    >;
    const vfs = await openGameFolderNode(dir!);
    const pal = parsePal(await vfs.open('color.pal'));
    const keys = Object.keys(golden);
    expect(keys).toHaveLength(12);
    for (const key of keys) {
      const path = key.slice(key.indexOf('/') + 1);
      const single = frmExtensionDirection(path);
      const frm = parseFrm(
        await vfs.open(path),
        single !== undefined ? { singleDirection: single } : undefined,
      );
      const frame = frm.directions[single ?? 0]![0]!;
      const actual = {
        sha256: createHash('sha256').update(frameToRgba(frame, pal.rgba)).digest('hex'),
        width: frame.width,
        height: frame.height,
        fps: frm.fps,
        framesPerDirection: frm.framesPerDirection,
        distinctDirections: frm.distinctDirections,
      };
      expect(`${vfs.resolve(path)!.name}/${path}`, key).toBe(key);
      expect(actual, key).toEqual(golden[key]);
    }
  });
});
