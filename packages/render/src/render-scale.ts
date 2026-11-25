/** Domyslny limit pikseli bufora renderu (urzadzenia). ~1.6 MPx: Pixel 7 (412x915 css, dpr 2.625) wychodzi z 2.6 MPx do ~1.5 MPx. */
export const MAX_RENDER_PIXELS = 1_600_000;

/**
 * Efektywny dpr bufora renderu. Fill-rate to waskie gardlo GPU telefonow (dpr 2.6-3 daje 7-9x wiecej
 * pikseli niz dpr 1), a grafika jest pixel-artem, wiec nadmiarowa rozdzielczosc nic nie wnosi.
 * Zwraca dpr ograniczony tak, by css*css*dpr^2 <= maxPixels, ale nigdy nizej niz 1 (desktop 1080p
 * zostaje natywny) i nigdy wyzej niz `dpr`. Krok 0.25 (stabilne rozmiary bufora przy resize).
 */
export function renderDpr(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  maxPixels = MAX_RENDER_PIXELS,
): number {
  const base = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const area = Math.max(1, cssWidth) * Math.max(1, cssHeight);
  const limit = Math.sqrt(maxPixels / area);
  const capped = Math.min(base, limit);
  const stepped = Math.floor(capped * 4) / 4;
  return Math.min(base, Math.max(1, stepped));
}

/** Dpr po adaptacyjnej skali (AdaptiveScale): base * scale, krok 0.125, nie nizej niz 0.5. */
export function scaledDpr(baseDpr: number, scale: number): number {
  const s = Number.isFinite(scale) && scale > 0 ? Math.min(scale, 1) : 1;
  return Math.max(0.5, Math.round(baseDpr * s * 8) / 8);
}
