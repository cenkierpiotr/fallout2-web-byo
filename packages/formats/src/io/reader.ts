import { FormatError } from '../errors.js';

export class ByteReader {
  private readonly view: DataView;
  private p: number;

  constructor(bytes: Uint8Array, pos = 0) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.p = 0;
    this.seek(pos);
  }

  get pos(): number {
    return this.p;
  }

  get remaining(): number {
    return this.view.byteLength - this.p;
  }

  seek(pos: number): void {
    if (!Number.isInteger(pos) || pos < 0 || pos > this.view.byteLength) {
      throw new FormatError('reader', 'odczyt poza buforem', pos);
    }
    this.p = pos;
  }

  private need(n: number): void {
    if (!Number.isInteger(n) || n < 0 || this.p + n > this.view.byteLength) {
      throw new FormatError('reader', 'odczyt poza buforem', this.p);
    }
  }

  u8(): number {
    this.need(1);
    return this.view.getUint8(this.p++);
  }
  u16le(): number {
    this.need(2);
    const v = this.view.getUint16(this.p, true);
    this.p += 2;
    return v;
  }
  u32le(): number {
    this.need(4);
    const v = this.view.getUint32(this.p, true);
    this.p += 4;
    return v;
  }
  u16be(): number {
    this.need(2);
    const v = this.view.getUint16(this.p, false);
    this.p += 2;
    return v;
  }
  u32be(): number {
    this.need(4);
    const v = this.view.getUint32(this.p, false);
    this.p += 4;
    return v;
  }
  i16be(): number {
    this.need(2);
    const v = this.view.getInt16(this.p, false);
    this.p += 2;
    return v;
  }
  i16le(): number {
    this.need(2);
    const v = this.view.getInt16(this.p, true);
    this.p += 2;
    return v;
  }

  /** Zwraca widok (subarray) bez kopiowania. */
  bytes(n: number): Uint8Array {
    this.need(n);
    const out = new Uint8Array(this.view.buffer, this.view.byteOffset + this.p, n);
    this.p += n;
    return out;
  }
}
