import type { LightField } from './light-field.js';
import type { LightPass } from './light-pass.js';
import type { ParallaxState } from './parallax.js';
import type { LitFrameState } from './types.js';

/** Sklada `LitFrameState` z obiektow M9 (LightPass, LightField, ParallaxState). */
export function buildLitFrameState(
  pass: LightPass,
  field: LightField | null,
  parallax: ParallaxState,
  cameraDelta: [number, number],
  time: number,
): LitFrameState {
  const u = pass.uniforms();
  const p = parallax.uniforms(cameraDelta);
  return {
    enabled: pass.enabled,
    ambient: u.uAmbient,
    sunDir: u.uSunDir,
    normalStrength: u.uNormalStrength,
    lightCount: u.uLightCount,
    lightsUbo: pass.uboData,
    ...(field
      ? {
          lightMap: {
            data: field.texture,
            width: field.width,
            height: field.height,
            version: field.version,
          },
        }
      : {}),
    cameraDelta: p.uCameraDelta,
    parallaxFactor: p.uParallaxFactor,
    time,
  };
}
