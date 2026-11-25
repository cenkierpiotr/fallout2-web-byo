import { FormatError } from '../errors.js';
import type { Palette } from './index.js';

/**
 * Zakresy, dlugosci i kolory cykli odczytane w silnik gry (specyfikacja formatu R3, 2026-11-10;
 * funkcja cyklujaca pod 0x42e97a, tablice 8-bit w DGROUP od 0x518440).
 * `colors` to tablica z binarki (8-bit); `applyColorCycles` wpisuje kolory z tablic
 * (w color.pal indeksy 229..255 sa znacznikami 0xFF). Okresy rozstrzygniete w R3-U1 (bramki czasu: 200 ms slime+shore+fire_slow, 142 ms fire_fast, 100 ms monitors, 33 ms alarm); konwersja 8->6 bit (R3-U2) pozostaje otwarta.
 */
export interface ColorCycle {
  name: 'slime' | 'monitors' | 'fire_slow' | 'fire_fast' | 'shore' | 'alarm';
  firstIndex: number;
  count: number;
  periodMs: number;
  colors: Uint8Array; // count*3, 8-bit (z binarki)
}

const u8 = (...v: number[]): Uint8Array => Uint8Array.from(v);

export const COLOR_CYCLES: readonly ColorCycle[] = [
  {
    name: 'slime',
    firstIndex: 229,
    count: 4,
    periodMs: 200,
    colors: u8(0, 108, 0, 11, 115, 7, 27, 123, 15, 43, 131, 27),
  },
  {
    name: 'monitors',
    firstIndex: 233,
    count: 5,
    periodMs: 100,
    colors: u8(107, 107, 111, 99, 103, 127, 87, 107, 143, 0, 147, 163, 107, 187, 255),
  },
  {
    name: 'fire_slow',
    firstIndex: 238,
    count: 5,
    periodMs: 200,
    colors: u8(255, 0, 0, 215, 0, 0, 147, 43, 11, 255, 119, 0, 255, 59, 0),
  },
  {
    name: 'fire_fast',
    firstIndex: 243,
    count: 5,
    periodMs: 142,
    colors: u8(71, 0, 0, 123, 0, 0, 179, 0, 0, 123, 0, 0, 71, 0, 0),
  },
  {
    name: 'shore',
    firstIndex: 248,
    count: 6,
    periodMs: 200,
    colors: u8(83, 63, 43, 75, 59, 43, 67, 55, 39, 63, 51, 39, 55, 47, 35, 51, 43, 35),
  },
  // alarm: pulsowanie kanalu czerwonego indeksu 254 (nie rotacja), count 1 = brak rotacji
  { name: 'alarm', firstIndex: 254, count: 1, periodMs: 33, colors: u8(0, 0, 0) },
];

/** Sprowadza czas do skonczonego nieujemnego (NaN, ujemny, +-Infinity => 0). */
function sanitizeTime(timeMs: number): number {
  return Number.isFinite(timeMs) && timeMs > 0 ? timeMs : 0;
}

export function applyColorCycles(base: Palette, timeMs: number, out: Uint8Array): void {
  if (base.rgba.length !== 1024) {
    throw new FormatError('pal', `base.rgba musi miec 1024 B, ma ${base.rgba.length}`);
  }
  if (out.length < 1024) {
    throw new FormatError('pal', `out musi miec co najmniej 1024 B, ma ${out.length}`);
  }
  const t = sanitizeTime(timeMs);
  out.set(base.rgba);
  for (const { name, firstIndex, count, periodMs, colors } of COLOR_CYCLES) {
    // alarm to pulsowanie kanalu czerwonego (nie rotacja); indeks zostaje z palety bazowej
    if (name === 'alarm') continue;
    const shift = Math.floor(t / periodMs) % count;
    for (let j = 0; j < count; j++) {
      // w grze po kazdym ticku bufor przesuwa sie w strone wyzszych indeksow
      const src = ((j - shift + count) % count) * 3;
      const dst = (firstIndex + j) * 4;
      // indeksy 229..255 w color.pal to znaczniki (0xFF); kolory biora sie z tablic cykli
      out[dst] = colors[src]!;
      out[dst + 1] = colors[src + 1]!;
      out[dst + 2] = colors[src + 2]!;
      out[dst + 3] = 255;
    }
  }
}
