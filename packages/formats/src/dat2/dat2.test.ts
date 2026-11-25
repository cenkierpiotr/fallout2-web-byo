import { describe, expect, it } from 'vitest';
import { FormatError } from '../errors.js';
import { buildDat2 } from '../../test/build-dat2.js';
import { bufferSource } from '../io/source.js';
import {
  normalizeDatPath,
  parseDat2Footer,
  parseDat2Tree,
  readDat2Entry,
  readDat2Index,
} from './index.js';

const a = new Uint8Array(3000).map((_, i) => i % 200);
const b = new Uint8Array([1, 2, 3, 4, 5]);
const files = [
  { name: 'art\\tiles\\A.FRM', data: a, compress: true },
  { name: 'Data\\B.TXT', data: b, compress: false },
];

describe('dat2', () => {
  it('normalizeDatPath', () => {
    expect(normalizeDatPath('\\Art\\Tiles\\A.FRM')).toBe('art/tiles/a.frm');
  });

  it('indeks i odczyt wpisow', async () => {
    const src = bufferSource(buildDat2(files));
    const idx = await readDat2Index(src);
    expect(idx.entries.length).toBe(2);
    const e = idx.byName.get('art/tiles/a.frm')!;
    expect(e.compressed).toBe(true);
    expect(e.unpackedSize).toBe(3000);
    expect(await readDat2Entry(src, e)).toEqual(a);
    expect(await readDat2Entry(src, idx.byName.get('data/b.txt')!)).toEqual(b);
  });

  it('obciety plik -> FormatError', async () => {
    const bytes = buildDat2(files);
    const src = bufferSource(bytes.subarray(0, bytes.length - 100));
    await expect(readDat2Index(src)).rejects.toThrow(FormatError);
  });

  it('za maly plik -> FormatError', async () => {
    await expect(readDat2Index(bufferSource(new Uint8Array(4)))).rejects.toThrow(FormatError);
  });

  it('stopka z treeSize = size*2 -> FormatError', async () => {
    const bytes = buildDat2(files).slice();
    new DataView(bytes.buffer).setUint32(bytes.length - 8, bytes.length * 2, true);
    await expect(readDat2Index(bufferSource(bytes))).rejects.toThrow(FormatError);
  });

  it('parseDat2Footer', () => {
    const f = new Uint8Array(8);
    new DataView(f.buffer).setUint32(0, 11, true);
    new DataView(f.buffer).setUint32(4, 22, true);
    expect(parseDat2Footer(f)).toEqual({ treeSize: 11, dataSize: 22 });
  });
});

// pomocnicze: pojedyncze drzewo z jednym wpisem
function tree(opts: { count?: number; nameLen?: number; flag?: number; extra?: number } = {}) {
  const name = 'a.txt';
  const nameLen = opts.nameLen ?? name.length;
  const out = new Uint8Array(4 + 4 + name.length + 13 + (opts.extra ?? 0));
  const dv = new DataView(out.buffer);
  dv.setUint32(0, opts.count ?? 1, true);
  dv.setUint32(4, nameLen, true);
  out.set(new TextEncoder().encode(name), 8);
  out[8 + name.length] = opts.flag ?? 0;
  return out;
}

function withEntry(offset: number, packed: number, unpacked: number, compressed: boolean) {
  const t = tree({ flag: compressed ? 1 : 0 });
  const dv = new DataView(t.buffer);
  const base = 8 + 5 + 1;
  dv.setUint32(base, unpacked, true);
  dv.setUint32(base + 4, packed, true);
  dv.setUint32(base + 8, offset, true);
  return t;
}

function wrap(treeBytes: Uint8Array, dataLen: number, treeSizeOverride?: number): Uint8Array {
  const out = new Uint8Array(dataLen + treeBytes.length + 8);
  out.set(treeBytes, dataLen);
  const dv = new DataView(out.buffer);
  dv.setUint32(out.length - 8, treeSizeOverride ?? treeBytes.length, true);
  dv.setUint32(out.length - 4, out.length, true);
  return out;
}

describe('dat2: walidacja niezaufanego wejscia', () => {
  it('poprawne drzewo testowe parsuje sie', () => {
    expect(parseDat2Tree(withEntry(0, 0, 0, false))).toHaveLength(1);
  });
  it('zbyt duze count', () => {
    expect(() => parseDat2Tree(tree({ count: 0xffffffff }))).toThrow(FormatError);
  });
  it('nameLen poza drzewo', () => {
    expect(() => parseDat2Tree(tree({ nameLen: 1000 }))).toThrow(FormatError);
  });
  it('compressed spoza {0,1}', () => {
    expect(() => parseDat2Tree(tree({ flag: 2 }))).toThrow(FormatError);
  });
  it('nieuzyte bajty drzewa', () => {
    expect(() => parseDat2Tree(tree({ extra: 3 }))).toThrow(FormatError);
  });
  it('offset+packedSize poza dane', async () => {
    const bytes = wrap(withEntry(5, 100, 100, false), 10);
    await expect(readDat2Index(bufferSource(bytes))).rejects.toThrow(FormatError);
  });
  it('raw z packed != unpacked', async () => {
    const bytes = wrap(withEntry(0, 4, 5, false), 10);
    await expect(readDat2Index(bufferSource(bytes))).rejects.toThrow(/packedSize/);
  });
  it('treeSize < 4', async () => {
    const bytes = wrap(new Uint8Array(0), 8, 3);
    await expect(readDat2Index(bufferSource(bytes))).rejects.toThrow(FormatError);
  });
  it('poprawny wpis przechodzi przez readDat2Index', async () => {
    const bytes = wrap(withEntry(0, 4, 4, false), 10);
    const idx = await readDat2Index(bufferSource(bytes));
    expect(idx.entries).toHaveLength(1);
  });
  it('duplikaty nazw: ostatni wygrywa', async () => {
    const d = buildDat2([
      { name: 'X.TXT', data: new Uint8Array([1]), compress: false },
      { name: 'x.txt', data: new Uint8Array([2, 2]), compress: false },
    ]);
    const idx = await readDat2Index(bufferSource(d));
    expect(idx.entries).toHaveLength(2);
    expect(idx.byName.get('x.txt')!.unpackedSize).toBe(2);
  });
  it('krotki odczyt zrodla -> FormatError', async () => {
    const d = buildDat2(files);
    const real = bufferSource(d);
    const idx = await readDat2Index(real);
    const short = {
      size: real.size,
      read: async (o: number, l: number) => (await real.read(o, l)).subarray(0, l - 1),
    };
    await expect(readDat2Entry(short, idx.byName.get('data/b.txt')!)).rejects.toThrow(FormatError);
  });
});
