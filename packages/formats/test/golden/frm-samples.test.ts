import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readDat2Entry, readDat2Index } from '../../src/dat2/index.js';
import { parseFrm } from '../../src/frm/index.js';

const dir = process.env.F2_GAME_DIR;

async function load(dat: string, name: string): Promise<Uint8Array> {
  const fh = await open(join(dir!, dat), 'r');
  try {
    const { size } = await fh.stat();
    const src = {
      size,
      async read(offset: number, length: number) {
        const buf = new Uint8Array(length);
        const { bytesRead } = await fh.read(buf, 0, length, offset);
        return bytesRead === length ? buf : buf.subarray(0, bytesRead);
      },
    };
    const idx = await readDat2Index(src);
    const e = idx.byName.get(name);
    if (!e) throw new Error(`brak ${name} w ${dat}`);
    return await readDat2Entry(src, e);
  } finally {
    await fh.close();
  }
}

describe.skipIf(!dir)('FRM golden', () => {
  it('EDG1001.FRM', async () => {
    const f = parseFrm(await load('MASTER.DAT', 'art/tiles/edg1001.frm'));
    expect(f.fps).toBe(1);
    expect(f.framesPerDirection).toBe(1);
    expect(f.directions[0]![0]!.width).toBe(80);
    expect(f.directions[0]![0]!.height).toBe(36);
    expect(f.distinctDirections).toBe(1);
  });
  it('IFACE.FRM', async () => {
    const f = parseFrm(await load('MASTER.DAT', 'art/intrface/iface.frm'));
    expect(f.directions[0]![0]!.width).toBe(640);
    expect(f.directions[0]![0]!.height).toBe(99);
    expect(f.fps).toBe(0);
  });
  it('HMJMPSAA.FRM (critter)', async () => {
    const f = parseFrm(await load('CRITTER.DAT', 'art/critters/hmjmpsaa.frm'));
    expect(f.fps).toBe(8);
    expect(f.framesPerDirection).toBe(12);
    expect(f.distinctDirections).toBe(6);
    expect(Array.from(f.directionOffsets)).toEqual([0, 19910, 35615, 59720, 79142, 95060]);
    expect(f.dataSize).toBe(118700);
    expect(f.directions[0]![0]!.width).toBe(28);
    expect(f.directions[0]![0]!.height).toBe(63);
    expect(Array.from(f.shiftY)).toEqual([3, 5, 4, 3, 5, 3]);
  });
  it('HAPOWRBA.FR0 singleDirection 0', async () => {
    const f = parseFrm(await load('CRITTER.DAT', 'art/critters/hapowrba.fr0'), {
      singleDirection: 0,
    });
    expect(f.directions[0]!.length).toBe(11);
    expect(f.dataSize).toBe(214923);
  });
});
