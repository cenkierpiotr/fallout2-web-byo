export type LayoutMode = 'pc' | 'touch';

/** `pointer: coarse` albo waski ekran (<= 900 px) => touch. */
export function detectLayout(w: Window): LayoutMode {
  const coarse = typeof w.matchMedia === 'function' && w.matchMedia('(pointer: coarse)').matches;
  return coarse || w.innerWidth <= 900 ? 'touch' : 'pc';
}
