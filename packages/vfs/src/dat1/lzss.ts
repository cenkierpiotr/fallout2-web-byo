import { FormatError } from '@f2/formats';

const WINDOW = 4096;
const START = WINDOW - 18;

/**
 * Dekompresja wpisu DAT1 (Fallout 1): ciag blokow z naglowkiem i16 BE.
 * n == 0 koniec; n < 0: |n| bajtow surowych; n > 0: n bajtow LZSS (okno 4096, spacje, start 4078).
 * Okno jest wspolne dla blokow jednego wpisu.
 */
export function lzssDecompress(packed: Uint8Array, expectedSize: number): Uint8Array {
  const out = new Uint8Array(expectedSize);
  const win = new Uint8Array(WINDOW).fill(0x20);
  let wp = START;
  let op = 0;
  let ip = 0;
  const put = (b: number): void => {
    if (op >= expectedSize)
      throw new FormatError('DAT1', 'LZSS: wyjscie przekracza rozmiar wpisu', ip);
    out[op++] = b;
    win[wp] = b;
    wp = (wp + 1) & (WINDOW - 1);
  };
  while (ip + 2 <= packed.length && op < expectedSize) {
    let n = (packed[ip]! << 8) | packed[ip + 1]!;
    if (n & 0x8000) n -= 0x10000;
    ip += 2;
    if (n === 0) break;
    if (n < 0) {
      const len = -n;
      if (ip + len > packed.length)
        throw new FormatError('DAT1', 'LZSS: blok surowy poza danymi', ip);
      for (let i = 0; i < len; i++) put(packed[ip++]!);
      continue;
    }
    const end = ip + n;
    if (end > packed.length) throw new FormatError('DAT1', 'LZSS: blok poza danymi', ip);
    while (ip < end) {
      const flags = packed[ip++]!;
      for (let bit = 0; bit < 8 && ip < end; bit++) {
        if (flags & (1 << bit)) {
          put(packed[ip++]!);
        } else {
          if (ip + 2 > end) throw new FormatError('DAT1', 'LZSS: ucieta para', ip);
          const b1 = packed[ip]!;
          const b2 = packed[ip + 1]!;
          ip += 2;
          let from = b1 | ((b2 & 0xf0) << 4);
          const len = (b2 & 0x0f) + 3;
          for (let k = 0; k < len; k++) {
            put(win[from]!);
            from = (from + 1) & (WINDOW - 1);
          }
        }
      }
    }
  }
  if (op !== expectedSize) {
    throw new FormatError('DAT1', `LZSS: rozpakowano ${op} B, oczekiwano ${expectedSize}`);
  }
  return out;
}
