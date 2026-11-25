export const DEFAULT_PARALLAX_FACTOR = 0.02;

/** Warstwa glebi: 0 kafle, 0.5 obiekty/critters, 1 dachy. */
export type DepthLayer = 0 | 0.5 | 1;

/** Przesuniecie warstwy: delta * (layer - 0.5) * factor (jak w sprite.vert). */
export function parallaxOffset(
  cameraDelta: readonly [number, number],
  layer: number,
  factor: number,
): [number, number] {
  const k = (layer - 0.5) * factor;
  return [cameraDelta[0] * k + 0, cameraDelta[1] * k + 0];
}

/** Przesuniecie dachu wzgledem kafli = delta * factor. */
export function relativeParallaxShift(cameraDeltaPx: number, factor: number): number {
  return cameraDeltaPx * factor;
}

/** Stan parallaxu (zadanie 32). Domyslnie WYLACZONY: uniformy zerowe. */
export class ParallaxState {
  enabled = false;
  factor = DEFAULT_PARALLAX_FACTOR;

  uniforms(delta: [number, number]): { uCameraDelta: [number, number]; uParallaxFactor: number } {
    if (!this.enabled) return { uCameraDelta: [0, 0], uParallaxFactor: 0 };
    return { uCameraDelta: delta, uParallaxFactor: this.factor };
  }
}
