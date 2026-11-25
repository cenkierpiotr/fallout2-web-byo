export class AcmFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AcmFormatError';
  }
}

export interface AcmHeader {
  readonly signature: number;
  /** liczba probek PCM lacznie ze wszystkimi kanalami */
  readonly sampleCount: number;
  readonly channels: 1 | 2;
  readonly sampleRate: number;
  /** log2 dlugosci wiersza bloku (kolumny = 1 << levels) */
  readonly levels: number;
  /** liczba wierszy bloku */
  readonly subblocks: number;
  readonly dataOffset: 14;
}

export const ACM_SIGNATURE = 0x01032897;
export const ACM_HEADER_SIZE = 14;

export function parseAcmHeader(buf: Uint8Array): AcmHeader {
  if (buf.length < ACM_HEADER_SIZE) {
    throw new AcmFormatError(`ACM: za krotki naglowek (${buf.length} B)`);
  }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const signature = dv.getUint32(0, true);
  if (signature !== ACM_SIGNATURE) {
    throw new AcmFormatError(`ACM: zla sygnatura 0x${signature.toString(16)}`);
  }
  const sampleCount = dv.getUint32(4, true);
  const channels = dv.getUint16(8, true);
  if (channels !== 1 && channels !== 2) {
    throw new AcmFormatError(`ACM: nieobslugiwana liczba kanalow ${channels}`);
  }
  const sampleRate = dv.getUint16(10, true);
  const attrs = dv.getUint16(12, true);
  const levels = attrs & 0xf;
  const subblocks = attrs >>> 4;
  if (subblocks === 0) throw new AcmFormatError('ACM: subblocks == 0');
  return { signature, sampleCount, channels, sampleRate, levels, subblocks, dataOffset: 14 };
}
