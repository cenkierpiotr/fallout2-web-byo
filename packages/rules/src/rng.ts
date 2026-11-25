import type { Rng } from './types.js';

export interface SeededRng extends Rng {
  /** Nastepna liczba z [0, 1). */
  next(): number;
  /** Calkowita z [min, max] (alias `int`). */
  roll(min: number, max: number): number;
  /** `roll(1, 100) <= pct`. */
  chance(pct: number): boolean;
  /** Stan generatora (do zapisu/odtworzenia). */
  state(): number;
}

/** Seedowalny generator (mulberry32); cala losowosc walki idzie przez `Rng`, nigdy `Math.random`. */
export function createRng(seed: number): SeededRng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const roll = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    roll,
    int: roll,
    chance: (pct) => roll(1, 100) <= pct,
    state: () => s,
  };
}
