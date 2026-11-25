import type { Rng } from '../types.js';

/**
 * Rozwiazanie serii (0x423284, specyfikacja formatu R13e, D). Geometria linii strzalu (0x4163c8) = Z: wywolujacy
 * podaje kryterow w kolejnosci wzdluz linii. Kryter bez trafien nie trafia na liste extras (Z).
 */
export const BURST_MAX_EXTRAS = 6;

export interface BurstTarget {
  id: number;
  /** Szansa trafienia (0..100) dla tego krytera. */
  toHit: number;
  isMain: boolean;
}

export interface BurstInput {
  rounds: number;
  /** 'burst' = 0x2e, 'flame' = 0x2f. */
  mode: 'burst' | 'flame';
  targets: readonly BurstTarget[];
}

export interface BurstResult {
  mainHits: number;
  extras: { id: number; hits: number }[];
}

export function resolveBurst(input: BurstInput, rng: Rng): BurstResult {
  let rounds = input.rounds;
  let mainHits = 0;
  const extras: { id: number; hits: number }[] = [];
  for (const t of input.targets) {
    if (extras.length >= BURST_MAX_EXTRAS) break;
    if (rounds < 1 && input.mode !== 'flame') break;
    if (input.mode === 'flame') rounds = 1;
    let hits = 0;
    // rzut jest losowany zawsze przed sprawdzeniem pozostalych rund
    let r = rng.int(1, 100);
    while (r <= t.toHit && rounds > 0) {
      hits++;
      rounds--;
      r = rng.int(1, 100);
    }
    if (t.isMain) {
      mainHits += hits;
    } else if (hits > 0) {
      const ex = extras.find((e) => e.id === t.id);
      if (ex) ex.hits = input.mode === 'burst' ? ex.hits + hits : hits;
      else extras.push({ id: t.id, hits });
    }
  }
  return { mainHits: input.mode === 'flame' ? 0 : mainHits, extras };
}
