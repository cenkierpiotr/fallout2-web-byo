/** Flagi passow 2.5D. Wszystkie domyslnie WYLACZONE: render klasyczny bez zmian. */
export interface LightingFlags {
  lightPass: boolean;
  shadowPass: boolean;
  ssaoPass: boolean;
  parallax: boolean;
  colorGrading: boolean;
}

export const DEFAULT_LIGHTING_FLAGS: Readonly<LightingFlags> = Object.freeze({
  lightPass: false,
  shadowPass: false,
  ssaoPass: false,
  parallax: false,
  colorGrading: false,
});

export function makeLightingFlags(over: Partial<LightingFlags> = {}): LightingFlags {
  return { ...DEFAULT_LIGHTING_FLAGS, ...over };
}
