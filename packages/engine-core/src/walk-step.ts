/**
 * Krok chodu: kiedy obiekt przeskakuje na sasiedni hex (silnik gry,
 * tick animacji 0x417b30, krok 0x417360). Nie ma stalej liczby hexow na klatke:
 * przesuniecie pikselowe FRM jest sumowane w offsecie obiektu (+8/+0xc), a hex
 * zmienia sie, gdy offset osiagnie delte sasiada z tabel 0x51d96c (x) i
 * 0x51d984 (y). Po kroku offset -= delta.
 */

/** Delta pikselowa do sasiada, kierunki 0..5 (tabele 0x51d96c / 0x51d984). */
export const HEX_PIXEL_DELTA: readonly { dx: number; dy: number }[] = [
  { dx: 16, dy: -12 },
  { dx: 32, dy: 0 },
  { dx: 16, dy: 12 },
  { dx: -16, dy: 12 },
  { dx: -32, dy: 0 },
  { dx: -16, dy: -12 },
];

/** Czy skumulowany offset (offX, offY) osiagnal delte sasiada w kierunku dir. */
export function walkStepReached(dir: number, offX: number, offY: number): boolean {
  const d = HEX_PIXEL_DELTA[dir];
  if (!d) return false;
  return (
    (d.dx > 0 && d.dx <= offX) ||
    (d.dx < 0 && d.dx >= offX) ||
    (d.dy > 0 && d.dy <= offY) ||
    (d.dy < 0 && d.dy >= offY)
  );
}

/** Offset po wykonaniu kroku (odjecie delty). */
export function walkStepRemainder(
  dir: number,
  offX: number,
  offY: number,
): { x: number; y: number } {
  const d = HEX_PIXEL_DELTA[dir];
  if (!d) return { x: offX, y: offY };
  return { x: offX - d.dx, y: offY - d.dy };
}
