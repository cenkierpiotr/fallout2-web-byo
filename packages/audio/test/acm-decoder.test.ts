import { describe, expect, it } from 'vitest';
import { AcmStreamDecoder, decodeAcm } from '../src/acm/decoder.js';
import { AcmFormatError } from '../src/acm/header.js';

/** Zapis bitow LSB-first (jak czytnik ACM). */
class BitWriter {
  private bytes: number[] = [];
  private acc = 0;
  private n = 0;
  write(v: number, bits: number): void {
    for (let i = 0; i < bits; i++) {
      this.acc |= ((v >> i) & 1) << this.n;
      if (++this.n === 8) {
        this.bytes.push(this.acc);
        this.acc = 0;
        this.n = 0;
      }
    }
  }
  finish(): number[] {
    if (this.n > 0) this.bytes.push(this.acc);
    return this.bytes;
  }
}

interface Spec {
  levels: number;
  subblocks?: number;
  sampleCount: number;
  channels?: 1 | 2;
  blocks: number;
  /** Kod kolumny (0 = zera, 3..16 = liniowy) */
  code: number;
  seed?: number;
}

/** Syntetyczny ACM: kazdy blok ma pwr=4, val=3 i wszystkie kolumny tym samym kodem. */
function buildAcm(s: Spec): Uint8Array {
  const sub = s.subblocks ?? 16;
  const L = 1 << s.levels;
  const w = new BitWriter();
  let seed = s.seed ?? 12345;
  const rnd = (): number => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 0x7fff;
  for (let b = 0; b < s.blocks; b++) {
    w.write(4, 4);
    w.write(3, 16);
    for (let c = 0; c < L; c++) {
      w.write(s.code, 5);
      if (s.code >= 3) for (let r = 0; r < sub; r++) w.write(rnd() & ((1 << s.code) - 1), s.code);
    }
  }
  const body = w.finish();
  const out = new Uint8Array(14 + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x01032897, true);
  dv.setUint32(4, s.sampleCount, true);
  dv.setUint16(8, s.channels ?? 2, true);
  dv.setUint16(10, 22050, true);
  dv.setUint16(12, (sub << 4) | s.levels, true);
  out.set(body, 14);
  return out;
}

const concat = (parts: Int16Array[]): Int16Array => {
  const out = new Int16Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

describe('decodeAcm (syntetyczne strumienie)', () => {
  it('bloki zer daja zera, dokladnie sampleCount probek', () => {
    const buf = buildAcm({ levels: 7, sampleCount: 2048 * 2 - 5, blocks: 2, code: 0 });
    const pcm = decodeAcm(buf);
    expect(pcm.samples.length).toBe(2048 * 2 - 5);
    expect(pcm.samples.every((v) => v === 0)).toBe(true);
  });

  it('levels=8 i niepelny ostatni blok: dokladnie sampleCount, bez NaN', () => {
    const count = 4096 + 100;
    const buf = buildAcm({ levels: 8, sampleCount: count, blocks: 2, code: 6 });
    const pcm = decodeAcm(buf);
    expect(pcm.header.levels).toBe(8);
    expect(pcm.samples.length).toBe(count);
    expect(Array.from(pcm.samples).every((v) => Number.isFinite(v))).toBe(true);
    expect(pcm.samples.some((v) => v !== 0)).toBe(true);
  });

  it('uciety strumien: nie rzuca, zwraca sampleCount probek (odczyt poza koniec = zera)', () => {
    const full = buildAcm({ levels: 8, sampleCount: 4096 * 3, blocks: 3, code: 7 });
    const cut = full.subarray(0, 14 + Math.floor((full.length - 14) / 2));
    const pcm = decodeAcm(cut);
    expect(pcm.samples.length).toBe(4096 * 3);
    expect(Array.from(pcm.samples).every((v) => Number.isFinite(v))).toBe(true);
  });

  it('naglowek bez danych: zera i dokladna dlugosc', () => {
    const buf = buildAcm({ levels: 7, sampleCount: 3000, blocks: 0, code: 0 });
    expect(decodeAcm(buf).samples.length).toBe(3000);
  });

  it('niedozwolony kod kolumny rzuca AcmFormatError', () => {
    const buf = buildAcm({ levels: 7, sampleCount: 2048, blocks: 1, code: 1 });
    expect(() => decodeAcm(buf)).toThrow(AcmFormatError);
  });
});

describe('AcmStreamDecoder', () => {
  const buf = buildAcm({ levels: 7, sampleCount: 2048 * 5 + 123, blocks: 6, code: 9 });
  const full = decodeAcm(buf).samples;

  it('next() w kawalkach 4096 sklada sie na to samo co decodeAcm', () => {
    const s = new AcmStreamDecoder(buf);
    const parts: Int16Array[] = [];
    while (!s.done) parts.push(s.next(4096));
    expect(s.position).toBe(full.length);
    expect(concat(parts)).toEqual(full);
    expect(s.next(10).length).toBe(0);
  });

  it('next() w kawalkach nierownych (1, 777, 5000)', () => {
    const s = new AcmStreamDecoder(buf);
    const parts: Int16Array[] = [];
    const sizes = [1, 777, 5000];
    for (let i = 0; !s.done; i++) parts.push(s.next(sizes[i % 3]!));
    expect(concat(parts)).toEqual(full);
  });

  it('seek() w przod i w tyl daje probki zgodne z decodeAcm', () => {
    const s = new AcmStreamDecoder(buf);
    s.seek(5000);
    expect(s.position).toBe(5000);
    expect(s.next(300)).toEqual(full.subarray(5000, 5300));
    s.seek(100);
    expect(s.position).toBe(100);
    expect(s.next(50)).toEqual(full.subarray(100, 150));
    s.seek(full.length + 999);
    expect(s.position).toBe(full.length);
    expect(s.done).toBe(true);
  });
});
