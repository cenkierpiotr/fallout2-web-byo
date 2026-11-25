import { AcmFormatError, parseAcmHeader, type AcmHeader } from './header.js';

export interface AcmPcm {
  header: AcmHeader;
  samples: Int16Array;
}

const MID_CENTER = 32768;

// Tablice pakowania trojek/par (zgodne z inicjalizacja w silnik gry 0x4d3c78).
const TAB3 = new Uint8Array(32); // [i+3j+9k] = i+4j+16k
const TAB5 = new Uint16Array(128); // [i+5j+25k] = i+8j+64k
const TAB11 = new Uint8Array(128); // [i+11k] = i+16k
for (let k = 0; k < 3; k++)
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) TAB3[i + 3 * j + 9 * k] = i + 4 * j + 16 * k;
for (let k = 0; k < 5; k++)
  for (let j = 0; j < 5; j++)
    for (let i = 0; i < 5; i++) TAB5[i + 5 * j + 25 * k] = i + 8 * j + 64 * k;
for (let k = 0; k < 11; k++) for (let i = 0; i < 11; i++) TAB11[i + 11 * k] = i + 16 * k;

/** Dekoder blokowy ACM: kazde wywolanie decodeBlock() daje L*subblocks probek. */
class BlockDecoder {
  readonly header: AcmHeader;
  readonly L: number;
  readonly rows: number;
  readonly blockSamples: number;
  private readonly chunk: number;
  private readonly blk: Int32Array;
  private readonly st1: Int16Array;
  private readonly st2: Int32Array;
  private readonly mid = new Int16Array(65536);
  private midCount = 0;
  private pos: number;
  private acc = 0;
  private bits = 0;

  constructor(
    private readonly buf: Uint8Array,
    header: AcmHeader,
  ) {
    this.header = header;
    this.L = 1 << header.levels;
    this.rows = header.subblocks;
    this.blockSamples = this.L * this.rows;
    this.chunk = Math.max(1, Math.floor(2048 / this.L) - 2);
    this.blk = new Int32Array(this.blockSamples);
    this.st1 = new Int16Array(this.L);
    this.st2 = new Int32Array(this.L);
    this.pos = header.dataOffset;
  }

  reset(): void {
    this.pos = this.header.dataOffset;
    this.acc = 0;
    this.bits = 0;
    this.st1.fill(0);
    this.st2.fill(0);
  }

  private need(n: number): void {
    while (this.bits < n) {
      const b = this.pos < this.buf.length ? this.buf[this.pos]! : 0;
      this.pos++;
      this.acc |= b << this.bits;
      this.bits += 8;
    }
  }

  private take(n: number): number {
    this.need(n);
    const v = this.acc & ((1 << n) - 1);
    this.acc >>>= n;
    this.bits -= n;
    return v;
  }

  private skip(n: number): void {
    this.acc >>>= n;
    this.bits -= n;
  }

  /** Dekoduje kolejny blok do this.blk i filtruje; zwraca bufor int16 przez out. */
  decodeBlock(out: Int16Array): void {
    const pwr = this.take(4);
    const val = (this.take(16) << 16) >> 16;
    const count = 1 << pwr;
    const mid = this.mid;
    const clear = Math.max(this.midCount, count);
    mid.fill(0, MID_CENTER - clear, MID_CENTER + clear);
    for (let i = 0; i < count; i++) mid[MID_CENTER + i] = i * val;
    for (let i = 1; i <= count; i++) mid[MID_CENTER - i] = -i * val;
    this.midCount = count;

    for (let col = 0; col < this.L; col++) {
      const code = this.take(5);
      if (!this.fill(code, col)) throw new AcmFormatError(`ACM: zly kod kolumny ${code}`);
    }
    this.filter();
    const shift = this.header.levels;
    const blk = this.blk;
    for (let i = 0; i < this.blockSamples; i++) out[i] = blk[i]! >> shift;
  }

  private fill(code: number, col: number): boolean {
    const { L, rows, blk, mid } = this;
    const M = MID_CENTER;
    let r = 0;
    let idx = col;
    if (code === 0) {
      for (; r < rows;) {
        blk[idx] = 0;
        idx += L;
        r++;
      }
      return true;
    }
    if (code >= 3 && code <= 16) {
      const half = 1 << (code - 1);
      while (r < rows) {
        blk[idx] = mid[M + this.take(code) - half]!;
        idx += L;
        r++;
      }
      return true;
    }
    switch (code) {
      case 17: // k1_3
        while (r < rows) {
          this.need(3);
          const b = this.acc;
          if ((b & 1) === 0) {
            this.skip(1);
            {
              blk[idx] = 0;
              idx += L;
              r++;
            }
            if (r < rows) {
              blk[idx] = 0;
              idx += L;
              r++;
            }
          } else if ((b & 2) === 0) {
            this.skip(2);
            {
              blk[idx] = 0;
              idx += L;
              r++;
            }
          } else {
            this.skip(3);
            {
              blk[idx] = mid[M + ((b & 4) !== 0 ? 1 : -1)]!;
              idx += L;
              r++;
            }
          }
        }
        return true;
      case 18: // k1_2
        while (r < rows) {
          this.need(2);
          const b = this.acc;
          if ((b & 1) === 0) {
            this.skip(1);
            {
              blk[idx] = 0;
              idx += L;
              r++;
            }
          } else {
            this.skip(2);
            {
              blk[idx] = mid[M + ((b & 2) !== 0 ? 1 : -1)]!;
              idx += L;
              r++;
            }
          }
        }
        return true;
      case 19: // t1_5
        while (r < rows) {
          const x = TAB3[this.take(5)]!;
          {
            blk[idx] = mid[M + (x & 3) - 1]!;
            idx += L;
            r++;
          }
          if (r >= rows) break;
          {
            blk[idx] = mid[M + ((x >> 2) & 3) - 1]!;
            idx += L;
            r++;
          }
          if (r >= rows) break;
          {
            blk[idx] = mid[M + (x >> 4) - 1]!;
            idx += L;
            r++;
          }
        }
        return true;
      case 20: // k2_4
        while (r < rows) {
          this.need(4);
          const b = this.acc;
          if ((b & 1) === 0) {
            this.skip(1);
            {
              blk[idx] = 0;
              idx += L;
              r++;
            }
            if (r < rows) {
              blk[idx] = 0;
              idx += L;
              r++;
            }
          } else if ((b & 2) === 0) {
            this.skip(2);
            {
              blk[idx] = 0;
              idx += L;
              r++;
            }
          } else {
            this.skip(4);
            {
              blk[idx] = mid[M + ((b >> 2) & 3) - 2 + (((b >> 2) & 3) >= 2 ? 1 : 0)]!;
              idx += L;
              r++;
            }
          }
        }
        return true;
      case 21: // k2_3
        while (r < rows) {
          this.need(3);
          const b = this.acc;
          if ((b & 1) === 0) {
            this.skip(1);
            {
              blk[idx] = 0;
              idx += L;
              r++;
            }
          } else {
            this.skip(3);
            {
              blk[idx] = mid[M + ((b >> 1) & 3) - 2 + (((b >> 1) & 3) >= 2 ? 1 : 0)]!;
              idx += L;
              r++;
            }
          }
        }
        return true;
      case 22: // t2_7
        while (r < rows) {
          const x = TAB5[this.take(7)]!;
          {
            blk[idx] = mid[M + (x & 7) - 2]!;
            idx += L;
            r++;
          }
          if (r >= rows) break;
          {
            blk[idx] = mid[M + ((x >> 3) & 7) - 2]!;
            idx += L;
            r++;
          }
          if (r >= rows) break;
          {
            blk[idx] = mid[M + (x >> 6) - 2]!;
            idx += L;
            r++;
          }
        }
        return true;
      case 23: // k3_5
        while (r < rows) {
          this.need(5);
          const b = this.acc;
          if ((b & 1) === 0) {
            this.skip(1);
            {
              blk[idx] = 0;
              idx += L;
              r++;
            }
            if (r < rows) {
              blk[idx] = 0;
              idx += L;
              r++;
            }
          } else if ((b & 2) === 0) {
            this.skip(2);
            {
              blk[idx] = 0;
              idx += L;
              r++;
            }
          } else if ((b & 4) === 0) {
            this.skip(4);
            {
              blk[idx] = mid[M + ((b & 8) !== 0 ? 1 : -1)]!;
              idx += L;
              r++;
            }
          } else {
            this.skip(5);
            let v = (b >> 3) & 3;
            if (v >= 2) v += 3;
            {
              blk[idx] = mid[M + v - 3]!;
              idx += L;
              r++;
            }
          }
        }
        return true;
      case 24: // k3_4
        while (r < rows) {
          this.need(4);
          const b = this.acc;
          if ((b & 1) === 0) {
            this.skip(1);
            {
              blk[idx] = 0;
              idx += L;
              r++;
            }
          } else if ((b & 2) === 0) {
            this.skip(3);
            {
              blk[idx] = mid[M + ((b & 4) !== 0 ? 1 : -1)]!;
              idx += L;
              r++;
            }
          } else {
            this.skip(4);
            let v = (b >> 2) & 3;
            if (v >= 2) v += 3;
            {
              blk[idx] = mid[M + v - 3]!;
              idx += L;
              r++;
            }
          }
        }
        return true;
      case 26: // k4_5
        while (r < rows) {
          this.need(5);
          const b = this.acc;
          if ((b & 1) === 0) {
            this.skip(1);
            {
              blk[idx] = 0;
              idx += L;
              r++;
            }
            if (r < rows) {
              blk[idx] = 0;
              idx += L;
              r++;
            }
          } else if ((b & 2) === 0) {
            this.skip(2);
            {
              blk[idx] = 0;
              idx += L;
              r++;
            }
          } else {
            this.skip(5);
            let v = (b >> 2) & 7;
            if (v >= 4) v += 1;
            {
              blk[idx] = mid[M + v - 4]!;
              idx += L;
              r++;
            }
          }
        }
        return true;
      case 27: // k4_4
        while (r < rows) {
          this.need(4);
          const b = this.acc;
          if ((b & 1) === 0) {
            this.skip(1);
            {
              blk[idx] = 0;
              idx += L;
              r++;
            }
          } else {
            this.skip(4);
            let v = (b >> 1) & 7;
            if (v >= 4) v += 1;
            {
              blk[idx] = mid[M + v - 4]!;
              idx += L;
              r++;
            }
          }
        }
        return true;
      case 29: // t3_7
        while (r < rows) {
          const x = TAB11[this.take(7)]!;
          {
            blk[idx] = mid[M + (x & 15) - 5]!;
            idx += L;
            r++;
          }
          if (r >= rows) break;
          {
            blk[idx] = mid[M + (x >> 4) - 5]!;
            idx += L;
            r++;
          }
        }
        return true;
      default:
        return false;
    }
  }

  private filter(): void {
    const { L, blk } = this;
    if (this.header.levels === 0) return;
    const w1 = L >> 1;
    let remaining = this.rows;
    let off = 0;
    while (remaining > 0) {
      const m = Math.min(this.chunk, remaining);
      const rows1 = 2 * m;
      this.filter1(off, w1, rows1);
      for (let r = 0; r < rows1; r++) blk[off + r * w1]! += 1;
      let w = w1 >> 1;
      let rowsN = rows1 * 2;
      let so = 0;
      while (w > 0) {
        this.filter2(off, so, w, rowsN);
        so += 2 * w;
        w >>= 1;
        rowsN *= 2;
      }
      off += this.chunk * L;
      remaining -= this.chunk;
    }
  }

  private filter1(off: number, w: number, rows: number): void {
    const { blk, st1 } = this;
    for (let i = 0; i < w; i++) {
      let lo = st1[2 * i]!;
      let hi = st1[2 * i + 1]!;
      let idx = off + i;
      for (let r = 0; r < rows; r += 2) {
        const v = blk[idx]!;
        blk[idx] = lo + 2 * hi + v;
        const t = 2 * v - hi;
        idx += w;
        const x = blk[idx]!;
        blk[idx] = t - x;
        idx += w;
        lo = v;
        hi = x;
      }
      st1[2 * i] = lo;
      st1[2 * i + 1] = hi;
    }
  }

  private filter2(off: number, so: number, w: number, rows: number): void {
    const { blk, st2 } = this;
    for (let i = 0; i < w; i++) {
      let lo = st2[so + 2 * i]!;
      let hi = st2[so + 2 * i + 1]!;
      let idx = off + i;
      for (let r = 0; r < rows; r += 2) {
        const v = blk[idx]!;
        blk[idx] = lo + 2 * hi + v;
        const t = 2 * v - hi;
        idx += w;
        const x = blk[idx]!;
        blk[idx] = t - x;
        idx += w;
        lo = v;
        hi = x;
      }
      st2[so + 2 * i] = lo;
      st2[so + 2 * i + 1] = hi;
    }
  }
}

export class AcmStreamDecoder {
  readonly header: AcmHeader;
  private readonly dec: BlockDecoder;
  private readonly block: Int16Array;
  private blockPos = 0;
  private blockLen = 0;
  private pos = 0;

  constructor(buf: Uint8Array) {
    this.header = parseAcmHeader(buf);
    this.dec = new BlockDecoder(buf, this.header);
    this.block = new Int16Array(this.dec.blockSamples);
  }

  get position(): number {
    return this.pos;
  }

  get done(): boolean {
    return this.pos >= this.header.sampleCount;
  }

  private refill(): boolean {
    if (this.done) return false;
    this.dec.decodeBlock(this.block);
    this.blockPos = 0;
    this.blockLen = Math.min(this.block.length, this.header.sampleCount - this.pos);
    return true;
  }

  next(maxSamples: number): Int16Array {
    const want = Math.max(0, Math.min(maxSamples, this.header.sampleCount - this.pos));
    const out = new Int16Array(want);
    let n = 0;
    while (n < want) {
      if (this.blockPos >= this.blockLen && !this.refill()) break;
      const take = Math.min(want - n, this.blockLen - this.blockPos);
      out.set(this.block.subarray(this.blockPos, this.blockPos + take), n);
      this.blockPos += take;
      this.pos += take;
      n += take;
    }
    return out;
  }

  /** Ustawia pozycje (w probkach); do tylu restartuje dekoder, do przodu dekoduje i odrzuca. */
  seek(sample: number): void {
    const target = Math.max(0, Math.min(Math.floor(sample), this.header.sampleCount));
    if (target < this.pos) {
      this.dec.reset();
      this.pos = 0;
      this.blockPos = 0;
      this.blockLen = 0;
    }
    while (this.pos < target) {
      if (this.blockPos >= this.blockLen && !this.refill()) break;
      const take = Math.min(target - this.pos, this.blockLen - this.blockPos);
      this.blockPos += take;
      this.pos += take;
    }
  }
}

export function decodeAcm(buf: Uint8Array): AcmPcm {
  const dec = new AcmStreamDecoder(buf);
  return { header: dec.header, samples: dec.next(dec.header.sampleCount) };
}
