/** Prostokat nieprzezroczystych pikseli w obrebie klatki kafla (x1/y1 wylaczne). */
export interface TileBand {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Redukcja overdrawu podlogi: kafel 80x36 ma duzo przezroczystych rogow (indeks 0), a shader i tak
 * uruchamia fragmenty na calym prostokacie (potem `discard`). Dzielimy klatke na `bands` pasm
 * poziomych i kazde tniemy do zakresu x nieprzezroczystych pikseli. Wynik to nadzbior
 * nieprzezroczystych pikseli (rysunek bez zmian), z mniejszym polem do wypelnienia.
 * Pomiar na 3100 kaflach z tiles.lst: 4 pasma = -32% pola (2814 -> 1901 px), 6 = -37%, 1 = -10%.
 */
export function computeTileBands(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  bands: number,
): TileBand[] {
  const out: TileBand[] = [];
  const n = Math.max(1, Math.min(Math.floor(bands) || 1, height));
  const step = Math.ceil(height / n);
  for (let y0 = 0; y0 < height; y0 += step) {
    const y1 = Math.min(height, y0 + step);
    let minX = width;
    let maxX = -1;
    let minY = y1;
    let maxY = -1;
    for (let y = y0; y < y1; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        if ((pixels[row + x] as number) === 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        maxY = y;
      }
    }
    if (maxX < 0) continue;
    out.push({ x0: minX, y0: n === 1 ? minY : y0, x1: maxX + 1, y1: n === 1 ? maxY + 1 : y1 });
  }
  return out;
}
