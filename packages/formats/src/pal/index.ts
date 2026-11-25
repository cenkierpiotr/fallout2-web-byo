import { FormatError } from '../errors.js';

export interface Palette {
  rgba: Uint8Array; // 256*4
  special: Uint8Array; // 256
  lookup15: Uint8Array; // 32768 lub dlugosc 0
}

export function parsePal(bytes: Uint8Array): Palette {
  const len = bytes.length;
  if (len !== 768 && len !== 33536) {
    throw new FormatError('pal', `Oczekiwana dlugosc 768 lub 33536 B, otrzymano ${len}`);
  }
  const rgba = new Uint8Array(256 * 4);
  const special = new Uint8Array(256);
  const lookup15 = len === 33536 ? bytes.slice(768, 33536) : new Uint8Array(0);
  for (let i = 0; i < 256; i++) {
    const r = bytes[i * 3]!;
    const g = bytes[i * 3 + 1]!;
    const b = bytes[i * 3 + 2]!;
    if (r > 63 || g > 63 || b > 63) special[i] = 1;
    rgba[i * 4] = Math.min(255, r * 4);
    rgba[i * 4 + 1] = Math.min(255, g * 4);
    rgba[i * 4 + 2] = Math.min(255, b * 4);
    rgba[i * 4 + 3] = i === 0 ? 0 : 255;
  }
  return { rgba, special, lookup15 };
}
