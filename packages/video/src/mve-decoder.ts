import {
  decodeMveAudioFrame,
  decodeMveVideoData,
  iterateMveRecords,
  parseMveAudioInit,
  parseMveHeader,
  type MveAudioInit,
  type MveOpcode,
  type MveRecord,
} from '@f2/formats';

export interface MveFrame {
  index: number;
  /** width*height*4, alpha 255, przez palete. */
  rgba: Uint8Array;
  /** Przeplecione L,R int16 (22050 Hz) albo null. */
  audio: Int16Array | null;
  isKeyframe: boolean;
}

/** Strumieniowy dekoder MVE: jedna klatka wyjsciowa na rekord typu 3. */
export class MveDecoder {
  width = 640;
  height = 480;
  fps = 15;
  audioInit: MveAudioInit | null = null;
  /** 256 x RGB, 8 bit. */
  readonly palette = new Uint8Array(768);
  error: string | null = null;

  /** Wysokosc obszaru wideo w pikselach (bloki 8x8; reszta bufora trybu to czern). */
  get videoHeight(): number {
    return Math.min(this.height, this.blocksH * 8);
  }

  private readonly records: Generator<MveRecord>;
  private blocksW = 80;
  private blocksH = 40;
  private map: Uint8Array | null = null;
  private shown = new Uint8Array(640 * 480);
  private spare = new Uint8Array(640 * 480);
  private index = 0;
  private done = false;

  constructor(bytes: Uint8Array) {
    parseMveHeader(bytes);
    this.records = iterateMveRecords(bytes);
  }

  nextFrame(): MveFrame | null {
    if (this.done || this.error) return null;
    try {
      // reczne next(): return z for..of zamknalby generator
      for (let r = this.records.next(); !r.done; r = this.records.next()) {
        const rec = r.value;
        const audio: Int16Array[] = [];
        for (const op of rec.opcodes) this.handle(op, audio);
        if (rec.type !== 3) continue;
        const frame: MveFrame = {
          index: this.index,
          rgba: this.toRgba(),
          audio: joinAudio(audio),
          isKeyframe: this.index === 0,
        };
        this.index++;
        return frame;
      }
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
    this.done = true;
    return null;
  }

  private handle(op: MveOpcode, audio: Int16Array[]): void {
    const d = op.data;
    switch (op.code) {
      case 0x02:
        if (d.byteLength >= 6) {
          const us = d.getUint32(0, true) * d.getUint16(4, true);
          if (us > 0) this.fps = 1e6 / us;
        }
        break;
      case 0x03:
        this.audioInit = parseMveAudioInit(d);
        break;
      case 0x05:
        this.blocksW = d.getUint16(0, true);
        this.blocksH = d.getUint16(2, true);
        break;
      case 0x08:
        audio.push(decodeMveAudioFrame(d));
        break;
      case 0x0a:
        this.width = d.getUint16(0, true);
        this.height = d.getUint16(2, true);
        this.shown = new Uint8Array(this.width * this.height);
        this.spare = new Uint8Array(this.width * this.height);
        break;
      case 0x0c: {
        const start = d.getUint16(0, true);
        const count = d.getUint16(2, true);
        for (let i = 0; i < count && start + i < 256 && 4 + i * 3 + 3 <= d.byteLength; i++) {
          for (let c = 0; c < 3; c++) {
            this.palette[(start + i) * 3 + c] = Math.min(255, d.getUint8(4 + i * 3 + c) * 4);
          }
        }
        break;
      }
      case 0x0f:
        this.map = new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
        break;
      case 0x11: {
        if (!this.map) throw new Error('opkod 0x11 bez mapy dekodowania');
        // silnik gry 0x4f521a: flagi u16 (body+12) bit0 => zamiana powierzchni 0x51ee00/04
        // PRZED dekodowaniem (0x4f5f20); dekoduje sie do biezacej (shown) z prev = spare.
        if (d.byteLength >= 14 && (d.getUint16(12, true) & 1) !== 0) {
          [this.shown, this.spare] = [this.spare, this.shown];
        }
        decodeMveVideoData({
          data: new Uint8Array(d.buffer, d.byteOffset, d.byteLength),
          map: this.map,
          cur: this.shown,
          prev: this.spare,
          width: this.width,
          blocksW: this.blocksW,
          blocksH: this.blocksH,
        });
        break;
      }
      default:
        break;
    }
  }

  private toRgba(): Uint8Array {
    const out = new Uint8Array(this.shown.length * 4);
    for (let i = 0; i < this.shown.length; i++) {
      const p = this.shown[i]! * 3;
      out[i * 4] = this.palette[p]!;
      out[i * 4 + 1] = this.palette[p + 1]!;
      out[i * 4 + 2] = this.palette[p + 2]!;
      out[i * 4 + 3] = 255;
    }
    return out;
  }
}

function joinAudio(parts: Int16Array[]): Int16Array | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  const out = new Int16Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
