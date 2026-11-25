import type { Initiative } from './types.js';

/**
 * Porownywarka 0x4223c8 (qsort, malejaco; D): wieksza Sequence pierwsza, remis: wieksza AG pierwsza,
 * dalszy remis 0. Sam qsort 0x4f05b6 (Watcom) NIE jest stabilny: patrz `watcomQsort`.
 */
export function compareInitiative(a: Initiative, b: Initiative): number {
  if (a.sequence !== b.sequence) return a.sequence > b.sequence ? -1 : 1;
  if (a.agility !== b.agility) return a.agility > b.agility ? -1 : 1;
  return 0;
}

/**
 * qsort 0x4f05b6 (D, specyfikacja formatu 2026-11-13). Dla n < 16 (0x4f0609: cmp n, 0x10) to sort Shella z odstepami 3 i 1
 * (0x4f05e0: gap0 = 3*rozmiar, krok -2*rozmiar): dla kazdego i >= gap porownuje (j-gap, j) i zamienia,
 * gdy porownywarka > 0 (0x4f067e), j -= gap. Z odstepem 3 sort NIE jest stabilny: elementy rowne mog
 * zamienic sie miejscami. Dla n >= 16 oryginal uzywa quicksorta z mediana (tu: sort stabilny, ta
 * sciezka dla liczby walczacych >= 16 nie jest odtworzona). Uwaga: oryginal przy j w (0, gap) czyta
 * element przed tablica (0x4f0668: j > base zamiast j >= base+gap); tu pomijamy to porownanie.
 */
export function watcomQsort<T>(items: readonly T[], cmp: (a: T, b: T) => number): T[] {
  const a = [...items];
  const n = a.length;
  if (n >= 16) return a.sort(cmp);
  for (let gap = 3; gap > 0; gap -= 2) {
    for (let i = gap; i < n; i++) {
      for (let j = i; j - gap >= 0; j -= gap) {
        if (cmp(a[j - gap] as T, a[j] as T) <= 0) break;
        const t = a[j] as T;
        a[j] = a[j - gap] as T;
        a[j - gap] = t;
      }
    }
  }
  return a;
}

/** Kolejnosc tur wg qsort oryginalu; nie mutuje wejscia. */
export function turnOrder<T extends Initiative>(all: readonly T[]): T[] {
  return watcomQsort(all, compareInitiative);
}
