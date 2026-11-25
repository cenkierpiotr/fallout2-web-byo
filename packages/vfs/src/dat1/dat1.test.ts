import { describe, expect, it } from 'vitest';
import { open } from 'node:fs/promises';
import { bufferSource } from '@f2/formats';
import type { RandomAccessSource } from '@f2/formats';
import {
  Dat1FormatError,
  Dat1Layer,
  extractDat1Entry,
  lzssDecompress,
  readDat1Index,
} from './index.js';

const be32 = (v: number): number[] => [
  (v >>> 24) & 255,
  (v >>> 16) & 255,
  (v >>> 8) & 255,
  v & 255,
];
const name = (s: string): number[] => [s.length, ...[...s].map((c) => c.charCodeAt(0))];

function buildDat1(): Uint8Array {
  const raw = [0x64, 0x61, 0x74, 0x61]; // "data"
  // LZSS: blok n=9: flaga 0xFF + 8 literalow "abcdefgh"
  const lz = [0x00, 0x09, 0xff, ...[...'abcdefgh'].map((c) => c.charCodeAt(0))];
  const tableSize =
    16 + (1 + 1) + (1 + 9) + 16 + (name('a.txt').length + 16) + 16 + (name('b.dat').length + 16);
  const rawOff = tableSize;
  const lzOff = rawOff + raw.length;
  const bytes = [
    ...be32(2),
    ...be32(0x0a),
    ...be32(0),
    ...be32(0),
    ...name('.'),
    ...name('ART\\TILES'),
    ...be32(1),
    ...be32(0x0a),
    ...be32(0x10),
    ...be32(0),
    ...name('a.txt'),
    ...be32(0x20),
    ...be32(rawOff),
    ...be32(4),
    ...be32(4),
    ...be32(1),
    ...be32(0x0a),
    ...be32(0x10),
    ...be32(0),
    ...name('b.dat'),
    ...be32(0x40),
    ...be32(lzOff),
    ...be32(8),
    ...be32(lz.length),
    ...raw,
    ...lz,
  ];
  return new Uint8Array(bytes);
}

describe('DAT1', () => {
  it('parsuje indeks i wypakowuje wpisy surowe i LZSS', async () => {
    const src = bufferSource(buildDat1());
    const idx = await readDat1Index(src);
    expect(idx.entries.length).toBe(2);
    const a = idx.byName.get('a.txt')!;
    expect(a.compressed).toBe(false);
    expect(new TextDecoder().decode(await extractDat1Entry(src, a))).toBe('data');
    const b = idx.byName.get('art/tiles/b.dat')!;
    expect(b.compressed).toBe(true);
    expect(new TextDecoder().decode(await extractDat1Entry(src, b))).toBe('abcdefgh');
  });

  it('Dat1Layer: has/open/keys, sciezka z backslashem i wielkie litery', async () => {
    const layer = await Dat1Layer.open('f1', bufferSource(buildDat1()));
    expect(layer.has('ART\\TILES\\B.DAT')).toBe(true);
    expect(layer.has('nie-ma')).toBe(false);
    expect((await layer.open('A.TXT')).length).toBe(4);
    expect([...layer.keys()].length).toBe(2);
  });

  it('lzss: referencja wsteczna do okna (spacje startowe) i blok surowy (n<0)', () => {
    // flagi 0b00000000: para (b1=0x00,b2=0x00): offset 0 (spacje), dlugosc 3 -> "   "
    const packed = new Uint8Array([0x00, 0x03, 0x00, 0x00, 0x00, 0xff, 0xfe, 0x78, 0x79]);
    const out = lzssDecompress(packed, 5);
    expect(new TextDecoder().decode(out)).toBe('   xy');
  });

  it('test_dat1_rejects_dat2_file: stopka DAT2 -> Dat1FormatError', async () => {
    const b = new Uint8Array(64);
    b.set(be32(1), 0);
    const size = b.length;
    b.set([size & 255, (size >> 8) & 255, 0, 0], size - 4);
    await expect(readDat1Index(bufferSource(b))).rejects.toBeInstanceOf(Dat1FormatError);
  });

  it('odrzuca pusty/zly naglowek', async () => {
    await expect(readDat1Index(bufferSource(new Uint8Array(8)))).rejects.toBeInstanceOf(
      Dat1FormatError,
    );
    await expect(readDat1Index(bufferSource(new Uint8Array(32)))).rejects.toBeInstanceOf(
      Dat1FormatError,
    );
  });
});

const dir = process.env['F1_GAME_DIR'];
describe.skipIf(!dir)('DAT1 na realnym MASTER.DAT Fallout 1 (F1_GAME_DIR)', () => {
  it('indeks, color.pal 33536 B, rozpakowanie kilku wpisow LZSS', async () => {
    const fh = await open(`${dir}/MASTER.DAT`, 'r');
    const size = (await fh.stat()).size;
    const src: RandomAccessSource = {
      size,
      async read(offset, length) {
        const buf = new Uint8Array(length);
        await fh.read(buf, 0, length, offset);
        return buf;
      },
    };
    try {
      const idx = await readDat1Index(src);
      expect(idx.entries.length).toBeGreaterThan(1000);
      const pal = idx.entries.find((e) => e.name === 'color.pal');
      expect(pal).toBeDefined();
      // F1 color.pal ma 33536 B (nie 768 jak w F2); poprawny rozmiar po LZSS potwierdza dekoder
      const palBytes = await extractDat1Entry(src, pal!);
      expect(palBytes.length).toBe(33536);
      const lz = idx.entries.filter((e) => e.compressed).slice(0, 20);
      for (const e of lz) expect((await extractDat1Entry(src, e)).length).toBe(e.size);
    } finally {
      await fh.close();
    }
  });
});
