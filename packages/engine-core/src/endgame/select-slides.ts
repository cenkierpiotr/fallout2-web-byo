import type { EndgameSlide } from '@f2/formats';
import type { GvarReader } from './gvar-registry.js';

/** Slajdy zakonczenia: kolejnosc pliku, rownosc scisla gvar == value (0x43f788). Spec: endgame.md. */
export function selectEndgameSlides(
  slides: readonly EndgameSlide[],
  gvars: GvarReader,
): EndgameSlide[] {
  return slides.filter((s) => gvars.get(s.gvar) === s.value);
}
