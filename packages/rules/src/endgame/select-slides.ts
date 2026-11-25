/** Wiersz endgame.txt (minimalny, strukturalny; zgodny z EndgameSlide z @f2/formats). */
export interface EndgameRow {
  gvar: number;
  value: number;
}

export interface GvarSource {
  get(index: number): number;
}

/** Slajdy zakonczenia: kolejnosc pliku, rownosc scisla gvar == value (0x43f788). Spec: dokumentacja techniczna */
export function selectEndgameSlides<T extends EndgameRow>(
  rows: readonly T[],
  gvars: GvarSource,
): T[] {
  return rows.filter((s) => gvars.get(s.gvar) === s.value);
}
