/**
 * Transformacja swiat (px) -> (kolumna, wiersz) heksa, liniowe przyblizenie siatki z hexgrid.ts
 * (wx = 24*(199-x) + 16*y + 16, wy = -6*(199-x) + 12*y + 8; jitter parzystosci +-8 px pomijany,
 * bilinearna interpolacja w shaderze go wygladza). `inv` kolumnowo (mat2 GLSL).
 */
export const LIGHT_FIELD_TRANSFORM = (() => {
  const a = -24;
  const b = 16;
  const c = 6;
  const d = 12;
  const det = a * d - b * c;
  return {
    origin: [24 * 199 + 16, -6 * 199 + 8] as [number, number],
    inv: [d / det, -c / det, -b / det, a / det] as [number, number, number, number],
  };
})();
