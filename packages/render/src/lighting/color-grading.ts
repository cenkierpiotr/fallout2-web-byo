export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export type LutName = 'neutral' | 'bg3-warm' | 'retro-crt';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** Krzywa S o lekkim kontrascie (amount 0..1). */
const contrast = (v: number, amount: number): number => {
  const c = clamp01(v);
  const s = c < 0.5 ? 2 * c * c : 1 - 2 * (1 - c) * (1 - c);
  return c + (s - c) * amount;
};

/**
 * LUT 3D jako pasek: szerokosc size*size, wysokosc size, piksel (x = b*size + r, y = g).
 * `fn` dziala na 0..1.
 */
export function buildLut3d(
  fn: (r: number, g: number, b: number) => [number, number, number],
  size = 32,
): RgbaImage {
  const data = new Uint8Array(size * size * size * 4);
  const step = 1 / (size - 1);
  for (let g = 0; g < size; g++) {
    for (let b = 0; b < size; b++) {
      for (let r = 0; r < size; r++) {
        const [ro, go, bo] = fn(r * step, g * step, b * step);
        const i = (g * size * size + b * size + r) * 4;
        data[i] = Math.round(255 * clamp01(ro));
        data[i + 1] = Math.round(255 * clamp01(go));
        data[i + 2] = Math.round(255 * clamp01(bo));
        data[i + 3] = 255;
      }
    }
  }
  return { width: size * size, height: size, data };
}

export function builtinLut(name: LutName, size = 32): RgbaImage {
  switch (name) {
    case 'bg3-warm':
      return buildLut3d(
        (r, g, b) => [contrast(r * 1.08, 0.3), contrast(g, 0.3), contrast(b * 0.9, 0.3)],
        size,
      );
    case 'retro-crt':
      return buildLut3d((r, g, b) => {
        const gray = 0.3 * r + 0.59 * g + 0.11 * b;
        const mix = (v: number): number => v * 0.85 + gray * 0.15;
        return [
          contrast(mix(r) * 0.9, 0.6),
          contrast(mix(g) * 1.1, 0.6),
          contrast(mix(b) * 0.85, 0.6),
        ];
      }, size);
    default:
      return buildLut3d((r, g, b) => [r, g, b], size);
  }
}

/** Referencja CPU shadera (probkowanie najblizsze); alpha bez zmian, mix 0 = kopia. */
export function applyLutCpu(
  src: Uint8Array,
  lut: RgbaImage,
  size: number,
  mix: number,
): Uint8Array {
  const out = new Uint8Array(src.length);
  const m = clamp01(mix);
  const sc = (size - 1) / 255;
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i] ?? 0;
    const g = src[i + 1] ?? 0;
    const b = src[i + 2] ?? 0;
    const x = Math.round(b * sc) * size + Math.round(r * sc);
    const y = Math.round(g * sc);
    const o = (y * lut.width + x) * 4;
    out[i] = Math.round(r + ((lut.data[o] ?? r) - r) * m);
    out[i + 1] = Math.round(g + ((lut.data[o + 1] ?? g) - g) * m);
    out[i + 2] = Math.round(b + ((lut.data[o + 2] ?? b) - b) * m);
    out[i + 3] = src[i + 3] ?? 255;
  }
  return out;
}

/** Color grading LUT (zadanie 32). Domyslnie WYLACZONY: uMix = 0. */
export class ColorGrading {
  enabled = false;
  private mix = 1;
  private current: RgbaImage = builtinLut('neutral');

  setLut(name: LutName | { image: RgbaImage }): void {
    this.current = typeof name === 'string' ? builtinLut(name) : name.image;
  }
  get lut(): RgbaImage {
    return this.current;
  }
  setMix(m: number): void {
    this.mix = clamp01(m);
  }
  get uniforms(): { uLutSize: number; uMix: number } {
    return { uLutSize: this.current.height, uMix: this.enabled ? this.mix : 0 };
  }
}

export const COLOR_GRADING_VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const COLOR_GRADING_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uLut;
uniform float uLutSize;
uniform float uMix;
out vec4 fragColor;
vec3 lutSlice(vec3 c, float b) {
  float x = (b * uLutSize + c.r * (uLutSize - 1.0) + 0.5) / (uLutSize * uLutSize);
  float y = (c.g * (uLutSize - 1.0) + 0.5) / uLutSize;
  return texture(uLut, vec2(x, y)).rgb;
}
void main() {
  vec4 s = texture(uScene, vUv);
  vec3 c = clamp(s.rgb, 0.0, 1.0);
  float bf = c.b * (uLutSize - 1.0);
  float b0 = floor(bf);
  float b1 = min(b0 + 1.0, uLutSize - 1.0);
  vec3 graded = mix(lutSlice(c, b0), lutSlice(c, b1), bf - b0);
  fragColor = vec4(mix(s.rgb, graded, uMix), s.a);
}
`;
