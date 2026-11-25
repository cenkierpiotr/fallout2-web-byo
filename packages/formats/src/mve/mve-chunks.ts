import { FormatError } from '../errors.js';

export class MveFormatError extends FormatError {
  constructor(message: string, offset?: number) {
    super('mve', message, offset);
  }
}

export interface MveOpcode {
  code: number;
  version: number;
  data: DataView;
}

export interface MveRecord {
  offset: number;
  length: number;
  type: number;
  opcodes: MveOpcode[];
  truncated?: boolean;
}

const MAGIC = 'Interplay MVE File\x1a\x00';
const HEADER_SIZE = 26;

export function parseMveHeader(bytes: Uint8Array): { headerSize: number } {
  if (bytes.length < HEADER_SIZE) {
    throw new MveFormatError('naglowek MVE za krotki', bytes.length);
  }
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC.charCodeAt(i)) {
      throw new MveFormatError('zly magic MVE', i);
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint16(20, true) !== 0x001a ||
    view.getUint16(22, true) !== 0x0100 ||
    view.getUint16(24, true) !== 0x1133
  ) {
    throw new MveFormatError('zle stale naglowka MVE', 20);
  }
  return { headerSize: HEADER_SIZE };
}

export function* iterateMveRecords(bytes: Uint8Array): Generator<MveRecord> {
  parseMveHeader(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = HEADER_SIZE;
  while (pos + 4 <= bytes.length) {
    const length = view.getUint16(pos, true);
    const type = view.getUint16(pos + 2, true);
    const record: MveRecord = { offset: pos, length, type, opcodes: [] };
    const start = pos + 4;
    const end = start + length;
    const limit = Math.min(end, bytes.length);
    if (end > bytes.length) record.truncated = true;
    let op = start;
    while (op + 4 <= limit) {
      const opLen = view.getUint16(op, true);
      const dataStart = op + 4;
      if (dataStart + opLen > limit) {
        record.truncated = true;
        break;
      }
      record.opcodes.push({
        code: bytes[op + 2]!,
        version: bytes[op + 3]!,
        data: new DataView(bytes.buffer, bytes.byteOffset + dataStart, opLen),
      });
      op = dataStart + opLen;
    }
    yield record;
    if (record.truncated || type === 5) return;
    pos = end;
  }
}
