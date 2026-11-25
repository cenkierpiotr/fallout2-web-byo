import { MAX_POINT_LIGHTS, type PointLight, type Vec3 } from './types.js';

/** Floaty na swiatlo w UBO: [x,y,z,radius, r,g,b,intensity]. */
export const LIGHT_UBO_FLOATS_PER_LIGHT = 8;

export function packLights(lights: readonly PointLight[]): { data: Float32Array; count: number } {
  const data = new Float32Array(MAX_POINT_LIGHTS * LIGHT_UBO_FLOATS_PER_LIGHT);
  const count = Math.min(lights.length, MAX_POINT_LIGHTS);
  for (let i = 0; i < count; i++) {
    const l = lights[i]!;
    data.set([l.x, l.y, l.z, l.radius, l.color[0], l.color[1], l.color[2], l.intensity], i * 8);
  }
  return { data, count };
}

function normalize(v: Vec3): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 0 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 1];
}

export function lambertAtPoint(normal: Vec3, lightDir: Vec3): number {
  return Math.max(normal[0] * lightDir[0] + normal[1] * lightDir[1] + normal[2] * lightDir[2], 0);
}

/** smoothstep(radius, 0, dist): 1 przy dist<=0, 0 przy dist>=radius. */
export function attenuation(dist: number, radius: number): number {
  if (!(radius > 0)) return 0;
  const t = Math.min(1, Math.max(0, 1 - dist / radius));
  return t * t * (3 - 2 * t);
}

export interface LightPassOptions {
  normalStrength?: number;
  ambient?: Vec3;
  sunDir?: Vec3;
}

/**
 * Stan i uniformy przejscia oswietlenia 2.5D (zadanie 29). Czysta logika; shadery w
 * `shaders-light.ts`. Domyslnie WYLACZONE: render klasyczny bez zmian.
 */
export class LightPass {
  enabled = false;
  private packed = packLights([]);
  private ambient: Vec3;
  private sunDir: Vec3;
  private strength: number;

  constructor(opts: LightPassOptions = {}) {
    this.strength = Math.min(1, Math.max(0, opts.normalStrength ?? 0.6));
    this.ambient = opts.ambient ?? [1, 1, 1];
    this.sunDir = normalize(opts.sunDir ?? [0, 0, 1]);
  }

  setLights(lights: readonly PointLight[]): void {
    this.packed = packLights(lights);
  }
  get lightCount(): number {
    return this.packed.count;
  }
  get uboData(): Float32Array {
    return this.packed.data;
  }
  setAmbient(v: Vec3): void {
    this.ambient = v;
  }
  setSunDir(v: Vec3): void {
    this.sunDir = normalize(v);
  }
  setNormalStrength(s: number): void {
    this.strength = Math.min(1, Math.max(0, s));
  }
  effectiveNormalStrength(): number {
    return this.enabled ? this.strength : 0;
  }
  uniforms(): {
    uLightCount: number;
    uAmbient: Vec3;
    uSunDir: Vec3;
    uNormalStrength: number;
    uEnabled: 0 | 1;
  } {
    return {
      uLightCount: this.enabled ? this.packed.count : 0,
      uAmbient: this.ambient,
      uSunDir: this.sunDir,
      uNormalStrength: this.effectiveNormalStrength(),
      uEnabled: this.enabled ? 1 : 0,
    };
  }
}

/** Referencja CPU modelu shadera: albedo * (ambient*lightmap + suma lambert*atten*kolor*intensity). */
export function shadePixel(
  albedo: Vec3,
  normal: Vec3,
  pos: Vec3,
  ambient: Vec3,
  lightmap: number,
  lights: readonly PointLight[],
  normalStrength: number,
): [number, number, number] {
  const s = Math.min(1, Math.max(0, normalStrength));
  const n = normalize([normal[0] * s, normal[1] * s, 1 - s + normal[2] * s]);
  const acc: [number, number, number] = [
    ambient[0] * lightmap,
    ambient[1] * lightmap,
    ambient[2] * lightmap,
  ];
  for (const l of lights.slice(0, MAX_POINT_LIGHTS)) {
    const d: Vec3 = [l.x - pos[0], l.y - pos[1], l.z - pos[2]];
    const dist = Math.hypot(d[0], d[1], d[2]);
    const dir = normalize(d);
    const k = lambertAtPoint(n, dir) * attenuation(dist, l.radius) * l.intensity;
    for (let c = 0; c < 3; c++) acc[c] = (acc[c] ?? 0) + k * l.color[c]!;
  }
  return [
    Math.min(1, Math.max(0, albedo[0] * acc[0])),
    Math.min(1, Math.max(0, albedo[1] * acc[1])),
    Math.min(1, Math.max(0, albedo[2] * acc[2])),
  ];
}
