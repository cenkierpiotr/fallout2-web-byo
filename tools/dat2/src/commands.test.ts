import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bufferSource } from '@f2/formats';
import { nodeFileSource } from '@f2/vfs/node';
import { buildDat2 } from '../../../packages/formats/test/build-dat2.js';
import { extractDat, listDat } from './commands.js';

const a = new Uint8Array(500).map((_, i) => i % 7);
const b = new Uint8Array([1, 2, 3, 4]);
const dat = buildDat2([
  { name: 'art\\tiles\\a.frm', data: a, compress: true },
  { name: 'data\\b.bin', data: b, compress: false },
]);

describe('commands', () => {
  it('listDat zlicza wpisy', async () => {
    const r = await listDat(bufferSource(dat));
    expect(r.summary).toBe('2 entries, 1 zlib, 1 raw');
    expect(r.lines[0]).toBe('art\\tiles\\a.frm\tzlib\t500');
    expect(r.lines[1]).toBe('data\\b.bin\traw\t4');
  });

  it('extractDat nieczule na wielkosc liter i separator', async () => {
    const out = await extractDat(bufferSource(dat), 'ART/TILES/a.frm');
    expect(Array.from(out)).toEqual(Array.from(a));
  });

  it('extractDat: nieznana nazwa', async () => {
    await expect(extractDat(bufferSource(dat), 'nie/ma.frm')).rejects.toThrow('brak wpisu');
  });
});

describe('nodeFileSource', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dat2-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('czyta z pliku i zamyka uchwyt', async () => {
    const p = join(dir, 't.dat');
    await writeFile(p, dat);
    const src = await nodeFileSource(p);
    expect(src.size).toBe(dat.length);
    expect((await listDat(src)).summary).toBe('2 entries, 1 zlib, 1 raw');
    await src.close();
    await src.close();
    await expect(src.read(0, 1)).rejects.toThrow('zamkniety');
  });
});
