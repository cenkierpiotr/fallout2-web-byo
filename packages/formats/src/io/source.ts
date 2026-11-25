import { FormatError } from '../errors.js';

export interface RandomAccessSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export function bufferSource(bytes: Uint8Array): RandomAccessSource {
  return {
    size: bytes.length,
    async read(offset, length) {
      if (
        !Number.isInteger(offset) ||
        !Number.isInteger(length) ||
        offset < 0 ||
        length < 0 ||
        offset + length > bytes.length
      ) {
        throw new FormatError(
          'source',
          `odczyt poza zakresem: offset=${offset}, length=${length}, size=${bytes.length}`,
          offset,
        );
      }
      // zwraca widok (alias) bez kopii; wywolujacy kopiuje, gdy trzeba
      return bytes.subarray(offset, offset + length);
    },
  };
}
