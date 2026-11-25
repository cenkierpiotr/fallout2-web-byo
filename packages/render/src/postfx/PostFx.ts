/**
 * PostFx (Zadanie 34): parametry i referencyjna implementacja CPU (do testow bez GPU).
 * Shadery GLSL o tej samej matematyce w shaders.ts. Domyslnie neutralne (wyjscie == wejscie).
 */

export interface PostFxParams {
  gamma: number;
  bloomThreshold: number;
  bloomStrength: number;
  vignette: number;
  grain: number;
  crt: { enabled: boolean; scanlines: number; curvature: number; mask: number };
}

/** Wartosci "ladne" (do presetow), nie uzywane domyslnie. */
export const DEFAULT_POSTFX_PARAMS: PostFxParams = {
  gamma: 1,
  bloomThreshold: 0.8,
  bloomStrength: 0.25,
  vignette: 0.3,
  grain: 0.05,
  crt: { enabled: false, scanlines: 0.25, curvature: 0.02, mask: 0.15 },
};

/** Tozsamosc: nic nie zmienia obrazu. */
export const NEUTRAL_POSTFX_PARAMS: PostFxParams = {
  ...DEFAULT_POSTFX_PARAMS,
  bloomStrength: 0,
  vignette: 0,
  grain: 0,
  crt: { ...DEFAULT_POSTFX_PARAMS.crt },
};

export type PostFxPartial = Partial<Omit<PostFxParams, 'crt'>> & {
  crt?: Partial<PostFxParams['crt']>;
};

function pick(v: number | undefined, fallback: number, min: number, max: number): number {
  const x = v === undefined || !Number.isFinite(v) ? fallback : v;
  return Math.min(max, Math.max(min, x));
}

export function mergePostFxParams(base: PostFxParams, patch: PostFxPartial): PostFxParams {
  const c = patch.crt ?? {};
  return {
    gamma: pick(patch.gamma, base.gamma, 0.1, 4),
    bloomThreshold: pick(patch.bloomThreshold, base.bloomThreshold, 0, 1),
    bloomStrength: pick(patch.bloomStrength, base.bloomStrength, 0, 1),
    vignette: pick(patch.vignette, base.vignette, 0, 1),
    grain: pick(patch.grain, base.grain, 0, 1),
    crt: {
      enabled: c.enabled ?? base.crt.enabled,
      scanlines: pick(c.scanlines, base.crt.scanlines, 0, 1),
      curvature: pick(c.curvature, base.crt.curvature, 0, 0.2),
      mask: pick(c.mask, base.crt.mask, 0, 1),
    },
  };
}

export function isNeutralPostFx(p: PostFxParams): boolean {
  return (
    p.gamma === 1 && p.bloomStrength === 0 && p.vignette === 0 && p.grain === 0 && !p.crt.enabled
  );
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Deterministyczny szum w [-1, 1]. */
function hashNoise(x: number, y: number, t: number): number {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(t, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 2147483647.5 - 1;
}

export class PostFx {
  private params: PostFxParams;

  constructor(initial?: PostFxPartial) {
    this.params = mergePostFxParams(NEUTRAL_POSTFX_PARAMS, initial ?? {});
  }

  setParams(p: PostFxPartial): void {
    this.params = mergePostFxParams(this.params, p);
  }

  getParams(): PostFxParams {
    return { ...this.params, crt: { ...this.params.crt } };
  }

  /** True, gdy przejscie post-fx cokolwiek zmienia (inaczej mozna je pominac). */
  enabled(): boolean {
    return !isNeutralPostFx(this.params);
  }

  process(src: Uint8ClampedArray, width: number, height: number, timeMs = 0): Uint8ClampedArray {
    const p = this.params;
    if (isNeutralPostFx(p)) return new Uint8ClampedArray(src);

    const n = width * height;
    let cur = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) cur[i] = src[i]! / 255;

    // 1. krzywizna CRT
    if (p.crt.enabled && p.crt.curvature > 0) {
      const out = new Float32Array(n * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dx = (x + 0.5) / width - 0.5;
          const dy = (y + 0.5) / height - 0.5;
          const k = 1 + p.crt.curvature * (dx * dx + dy * dy) * 4;
          const u = 0.5 + dx * k;
          const v = 0.5 + dy * k;
          const o = (y * width + x) * 4;
          if (u < 0 || u >= 1 || v < 0 || v >= 1) {
            out[o + 3] = cur[o + 3]!;
            continue;
          }
          const s = (Math.floor(v * height) * width + Math.floor(u * width)) * 4;
          out[o] = cur[s]!;
          out[o + 1] = cur[s + 1]!;
          out[o + 2] = cur[s + 2]!;
          out[o + 3] = cur[o + 3]!;
        }
      }
      cur = out;
    }

    // 2. bloom: ekstrakcja, 1/4 rozdzielczosci, 2x rozmycie 3x3, dodanie
    if (p.bloomStrength > 0) {
      const bw = Math.max(1, Math.ceil(width / 4));
      const bh = Math.max(1, Math.ceil(height / 4));
      let a = new Float32Array(bw * bh * 3);
      const cnt = new Float32Array(bw * bh);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const o = (y * width + x) * 4;
          const lum = 0.299 * cur[o]! + 0.587 * cur[o + 1]! + 0.114 * cur[o + 2]!;
          const f = Math.max(0, lum - p.bloomThreshold);
          const b = ((y >> 2) * bw + (x >> 2)) * 3;
          a[b] = a[b]! + cur[o]! * f;
          a[b + 1] = a[b + 1]! + cur[o + 1]! * f;
          a[b + 2] = a[b + 2]! + cur[o + 2]! * f;
          cnt[(y >> 2) * bw + (x >> 2)] = cnt[(y >> 2) * bw + (x >> 2)]! + 1;
        }
      }
      for (let i = 0; i < bw * bh; i++) {
        const c = cnt[i]! || 1;
        a[i * 3] = a[i * 3]! / c;
        a[i * 3 + 1] = a[i * 3 + 1]! / c;
        a[i * 3 + 2] = a[i * 3 + 2]! / c;
      }
      for (let pass = 0; pass < 2; pass++) {
        const out = new Float32Array(a.length);
        for (let y = 0; y < bh; y++) {
          for (let x = 0; x < bw; x++) {
            for (let ch = 0; ch < 3; ch++) {
              let s = 0;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  const xx = Math.min(bw - 1, Math.max(0, x + dx));
                  const yy = Math.min(bh - 1, Math.max(0, y + dy));
                  s += a[(yy * bw + xx) * 3 + ch]!;
                }
              }
              out[(y * bw + x) * 3 + ch] = s / 9;
            }
          }
        }
        a = out;
      }
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const o = (y * width + x) * 4;
          const b = ((y >> 2) * bw + (x >> 2)) * 3;
          cur[o] = cur[o]! + a[b]! * p.bloomStrength;
          cur[o + 1] = cur[o + 1]! + a[b + 1]! * p.bloomStrength;
          cur[o + 2] = cur[o + 2]! + a[b + 2]! * p.bloomStrength;
        }
      }
    }

    // 3-6. gamma, winieta, ziarno, scanlines i maska CRT
    const inv = 1 / p.gamma;
    const frame = Math.floor(timeMs / 40);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        let vig = 1;
        if (p.vignette > 0) {
          const dx = (x + 0.5) / width - 0.5;
          const dy = (y + 0.5) / height - 0.5;
          vig = 1 - p.vignette * smoothstep(0.4, 0.9, Math.sqrt(dx * dx + dy * dy) * Math.SQRT2);
        }
        const g = p.grain > 0 ? hashNoise(x, y, frame) * p.grain * 0.5 : 0;
        const scan = p.crt.enabled && y % 2 === 1 ? 1 - p.crt.scanlines : 1;
        for (let ch = 0; ch < 3; ch++) {
          let c = cur[o + ch]!;
          if (p.gamma !== 1) c = Math.pow(Math.max(0, c), inv);
          c = c * vig + g;
          if (p.crt.enabled) c *= scan * (x % 3 === ch ? 1 : 1 - p.crt.mask);
          cur[o + ch] = c;
        }
      }
    }

    const res = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n * 4; i++) res[i] = i % 4 === 3 ? src[i]! : Math.round(cur[i]! * 255);
    return res;
  }
}
