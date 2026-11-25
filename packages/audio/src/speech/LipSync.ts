import type { LipData } from './lip.js';

/** Fonem -> klatka ust glowy (0..8), tabela z .data 0x518858. */
export const PHONEME_TO_FRAME: Uint8Array = new Uint8Array([
  0, 3, 1, 1, 3, 1, 1, 1, 7, 8, 7, 3, 1, 8, 1, 7, 7, 6, 6, 2, 2, 2, 2, 4, 4, 5, 5, 2, 2, 2, 2, 2, 6,
  2, 2, 5, 8, 2, 2, 2, 2, 8,
]);

export class LipSync {
  constructor(
    private readonly lip: LipData,
    private readonly table: Uint8Array = PHONEME_TO_FRAME,
  ) {}

  /** Klatka ust dla pozycji odtwarzania w bajtach PCM. */
  frameAt(posBytes: number): number {
    const n = this.lip.phonemes.length;
    if (n === 0) return 0;
    const pos = Number.isFinite(posBytes) && posBytes > 0 ? posBytes : 0;
    const m = this.lip.markers;
    // k = liczba markerow z offset < pos
    let lo = 0;
    let hi = m.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((m[mid]?.offset ?? Infinity) < pos) lo = mid + 1;
      else hi = mid;
    }
    const idx = lo === 0 ? 0 : Math.min(lo - 1, n - 1);
    const ph = this.lip.phonemes[idx] ?? 0;
    return ph < this.table.length ? (this.table[ph] ?? 0) : 0;
  }
}
