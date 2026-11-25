import { type FileHandle, open } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readDat2Entry, readDat2Index } from '../../src/dat2/index.js';
import type { RandomAccessSource } from '../../src/io/source.js';
import { lstName, lstNameBinary, parseLst } from '../../src/lst/index.js';

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

async function load(dat: string, name: string): Promise<string[]> {
  const src = await fileSource(join(dir!, dat));
  const idx = await readDat2Index(src);
  const e = idx.byName.get(name);
  if (!e) throw new Error(`brak ${name} w ${dat}`);
  return parseLst(await readDat2Entry(src, e));
}

describe.skipIf(!dir)('LST golden', () => {
  it('nazwa wg czytnika binarnego (strpbrk, max 12) = lstName po parseLst dla list art', async () => {
    const src = await fileSource(join(dir!, 'MASTER.DAT'));
    const idx = await readDat2Index(src);
    const lists = [...idx.byName.keys()].filter(
      (k) => /^art\/[a-z]+\/[a-z]+\.lst$/.test(k) && !/\/critters\//.test(k),
    );
    expect(lists.length).toBeGreaterThan(5);
    for (const k of lists) {
      const raw = await readDat2Entry(src, idx.byName.get(k)!);
      const text = new TextDecoder('latin1').decode(raw).split(/\r\n|\r|\n/);
      if (text[text.length - 1] === '') text.pop();
      const parsed = parseLst(raw);
      expect(parsed.length).toBe(text.length);
      text.forEach((line, i) => {
        const bin = lstNameBinary(line);
        expect(bin.length).toBeLessThanOrEqual(12);
        expect(bin, `${k}:${i}`).toBe(lstName(parsed[i]!));
      });
    }
  });
  it('TILES.LST', async () => {
    const l = await load('MASTER.DAT', 'art/tiles/tiles.lst');
    expect(l.length).toBe(3102);
    expect(l[173]!.toLowerCase()).toBe('edg1001.frm');
  });
  it('INTRFACE.LST', async () => {
    const l = await load('MASTER.DAT', 'art/intrface/intrface.lst');
    expect(l.length).toBe(469);
    expect(l[0]!.toLowerCase()).toBe('blank.frm');
  });
  it('CRITTERS.LST', async () => {
    const l = await load('CRITTER.DAT', 'art/critters/critters.lst');
    expect(l.length).toBe(103);
    expect(lstName(l[11]!)).toBe('hmjmps');
  });
});
