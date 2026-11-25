/** Dolna i gorna granica swiatla otoczenia (exe: clamp 0x4000..0x10000, render-order.md, D). */
export const AMBIENT_FLOOR = 0x4000 / 0x10000;

/** Intensywnosc z set_light_level (0x4000..0x10000) na ulamek 0.25..1. */
export function ambientFromScriptLevel(level: number): number {
  const v = Math.min(0x10000, Math.max(0x4000, level));
  return v / 0x10000;
}

/**
 * Mapa "na zewnatrz" (Z, heurystyka): malo kafli dachu (indeks > 1; 1 = pusty). Oryginal nie ma
 * rozroznienia, swiatlo ustawiaja skrypty, wiec to tylko fallback dla map bez skryptowego swiatla.
 */
export function isOutdoorMap(roof: ArrayLike<number>, maxRoofShare = 0.25): boolean {
  if (roof.length === 0) return false;
  let roofed = 0;
  for (let i = 0; i < roof.length; i++) if ((roof[i] as number) > 1) roofed++;
  return roofed / roof.length <= maxRoofShare;
}

/**
 * Swiatlo otoczenia mapy: skrypt (set_light_level) ma pierwszenstwo, inaczej krzywa zegara
 * dla map zewnetrznych, wnetrza zostaja jasne (pelne swiatlo, domyslne w silniku).
 */
export function resolveAmbient(
  scriptAmbient: number | undefined,
  clockAmbient: number,
  outdoor: boolean,
): number {
  if (scriptAmbient !== undefined) return Math.min(1, Math.max(AMBIENT_FLOOR, scriptAmbient));
  return outdoor ? Math.min(1, Math.max(AMBIENT_FLOOR, clockAmbient)) : 1;
}
