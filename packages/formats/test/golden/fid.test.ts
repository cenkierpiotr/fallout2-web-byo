import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readDat2Index } from '../../src/dat2/index.js';
import { critterAnimChars } from '../../src/fid/index.js';
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

describe.skipIf(!dir)('FID golden (art/critters w CRITTER.DAT)', () => {
  afterAll(async () => {
    await Promise.all(handles.map((h) => h.close()));
  });

  it('sufiksy krytera: 129 z 130 osiagalne przez critterAnimChars, wyjatek `au` (2 osierocone pliki)', async () => {
    const idx = await readDat2Index(await fileSource(join(dir!, 'CRITTER.DAT')));
    const reachable = new Set<string>();
    for (let weapon = 0; weapon <= 10; weapon++) {
      for (let anim = 0; anim <= 0xff; anim++) {
        const c = critterAnimChars(anim, weapon);
        if (c) reachable.add(c.first + c.second);
      }
    }
    const suffixes = new Set<string>();
    const unreachableFiles: string[] = [];
    for (const e of idx.entries) {
      const m = /^art\\critters\\([a-z0-9]{6})([a-z0-9]{2})\.(frm|fr[0-5])$/i.exec(e.name);
      if (!m) continue;
      const suf = m[2]!.toLowerCase();
      suffixes.add(suf);
      if (!reachable.has(suf)) unreachableFiles.push(e.name.toLowerCase());
    }
    expect(suffixes.size).toBe(130);
    expect([...suffixes].filter((s) => reachable.has(s)).length).toBe(129);
    expect(unreachableFiles.sort()).toEqual([
      'art\\critters\\hmlthrau.frm',
      'art\\critters\\hmmetlau.frm',
    ]);
  });
});
