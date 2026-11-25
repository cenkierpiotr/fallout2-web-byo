import type { PointLight, Vec3 } from './types.js';

export interface ShadowOptions {
  resolutionScale?: number;
  blurRadius?: number;
  opacity?: number;
  feather?: number;
  /** Cienie radialne od swiatel punktowych (preset ultra, 'sun+points'). Domyslnie false. */
  points?: boolean;
}

/** Do tylu pierwszych swiatel UBO liczone sa cienie punktowe (jeden kanal RGBA na swiatlo). */
export const MAX_POINT_SHADOWS = 4;
/** Wysokosc zrodla swiatla nad podloga w pikselach swiata przy rzucie cieni punktowych (Z). */
export const POINT_SHADOW_LIGHT_Z = 110;
/** Sprite wyzszy niz ta czesc wysokosci swiatla jest przycinany (rzut dazy do nieskonczonosci). */
export const POINT_SHADOW_MAX_H_RATIO = 0.8;

export interface SunLight {
  dir: Vec3;
  intensity: number;
}

function sunZ(dir: Vec3): number {
  return dir[2] <= 0 ? 0.05 : dir[2];
}

/**
 * Skos rzutu cienia na podloge (ADR-0011 "soft cast shadows"). Punkt (x, y, h) o wysokosci h
 * nad podloga laduje w (x + kx*h, y + ky*h), kx = dir.x/z, ky = -dir.y/z (ekran: y w dol).
 * Dla dir=(1,-1,0.5) cien pada w prawo i w dol. mat3 kolumnowo: x' = x + kx*h (trzecia kolumna
 * to (kx, ky, 1) przy wektorze (x, y, h)).
 */
export function sunSkewMatrix(dir: Vec3): number[] {
  const z = sunZ(dir);
  return [1, 0, 0, 0, 1, 0, dir[0] / z, -dir[1] / z, 1];
}

export function projectShadowPoint(dir: Vec3, x: number, y: number, h: number): [number, number] {
  const z = sunZ(dir);
  return [x + (h * dir[0]) / z, y - (h * dir[1]) / z];
}

/** Do `max` najjasniejszych swiatel (intensity*radius malejaco, stabilnie). */
export function pickShadowLights(lights: readonly PointLight[], max = 4): PointLight[] {
  return lights
    .map((light, index) => ({ light, index, score: light.intensity * light.radius }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, max))
    .map((e) => e.light);
}

/** Rzut radialny punktu (x,y,h) z pozycji swiatla na podloge (h=0). */
export function projectRadial(
  light: PointLight,
  x: number,
  y: number,
  h: number,
): [number, number] {
  if (!(light.z > h) || h <= 0) return [x, y];
  const t = light.z / (light.z - h);
  return [light.x + (x - light.x) * t, light.y + (y - light.y) * t];
}

export function gaussianKernel(radius: number): Float32Array {
  if (radius <= 0) return new Float32Array([1]);
  const sigma = Math.max(radius / 2, 0.5);
  const k = new Float32Array(2 * radius + 1);
  let sum = 0;
  for (let i = 0; i < k.length; i++) {
    const v = Math.exp(-0.5 * ((i - radius) / sigma) ** 2);
    k[i] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] = (k[i] ?? 0) / sum;
  return k;
}

function blur1d(src: Uint8Array, w: number, h: number, radius: number, horiz: boolean): Uint8Array {
  const k = gaussianKernel(radius);
  const half = (k.length - 1) / 2;
  const dst = new Uint8Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = 0; i < k.length; i++) {
        const o = i - half;
        const sx = horiz ? Math.min(w - 1, Math.max(0, x + o)) : x;
        const sy = horiz ? y : Math.min(h - 1, Math.max(0, y + o));
        s += (src[sy * w + sx] ?? 0) * (k[i] ?? 0);
      }
      dst[y * w + x] = Math.round(s);
    }
  }
  return dst;
}

export function blurRow(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  return blur1d(src, width, height, radius, true);
}

export function blurCol(
  src: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  return blur1d(src, width, height, radius, false);
}

/** Przejscie miekkich cieni rzucanych (zadanie 30). Domyslnie WYLACZONE. */
export class ShadowPass {
  enabled = false;
  private readonly opts: Required<ShadowOptions>;
  private skew: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  constructor(opts: ShadowOptions = {}) {
    this.opts = {
      resolutionScale: opts.resolutionScale ?? 0.5,
      blurRadius: opts.blurRadius ?? 3,
      opacity: opts.opacity ?? 0.45,
      feather: opts.feather ?? 0.5,
      points: opts.points ?? false,
    };
  }

  get options(): Required<ShadowOptions> {
    return this.opts;
  }

  maskSize(w: number, h: number): [number, number] {
    const s = this.opts.resolutionScale;
    return [Math.max(1, Math.ceil(w * s)), Math.max(1, Math.ceil(h * s))];
  }

  isNoop(sun: SunLight, lights: readonly PointLight[]): boolean {
    return !this.enabled || (sun.intensity <= 0 && lights.length === 0);
  }

  setSun(dir: Vec3): void {
    this.skew = sunSkewMatrix(dir);
  }

  uniforms(): { uSkew: number[]; uOpacity: number; uFeather: number } {
    return { uSkew: this.skew, uOpacity: this.opts.opacity, uFeather: this.opts.feather };
  }
}

/**
 * Referencja CPU cienia slonecznego: maska R8 (255 = bez cienia). Piksel sprite'a (alpha>127)
 * na wysokosci hp = (h-1-y) * heightScale rzutowany skosem; cien tylko poza sylwetka.
 * `heightScale` zamienia wiersze na jednostki wysokosci (1 = piksel na piksel).
 */
export function rasterizeSunShadowCpu(
  alpha: Uint8Array,
  w: number,
  h: number,
  dir: Vec3,
  heightScale: number,
  opacity: number,
  intensity: number,
): Uint8Array {
  const mask = new Uint8Array(w * h).fill(255);
  if (intensity <= 0 || opacity <= 0) return mask;
  const dark = Math.round(255 * (1 - Math.min(1, opacity * intensity)));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((alpha[y * w + x] ?? 0) <= 127) continue;
      const [sx, sy] = projectShadowPoint(dir, x, y, (h - 1 - y) * heightScale);
      const rx = Math.round(sx);
      const ry = Math.round(sy);
      if (rx < 0 || rx >= w || ry < 0 || ry >= h) continue;
      const i = ry * w + rx;
      if ((alpha[i] ?? 0) > 127) continue;
      mask[i] = Math.min(mask[i] ?? 255, dark);
    }
  }
  return mask;
}
