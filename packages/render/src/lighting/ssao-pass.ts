export interface SsaoOptions {
  scale?: number;
  samples?: number;
  radiusPx?: number;
  strength?: number;
}

/** Deterministyczny PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Jadro polsferyczne (z >= 0), dlugosci rosnace ku brzegowi: lerp(0.1, 1, (i/n)^2). */
export function makeHemisphereKernel(samples: number, seed = 1): Float32Array {
  const rnd = mulberry32(seed);
  const k = new Float32Array(samples * 3);
  for (let i = 0; i < samples; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    let len = 0;
    do {
      x = rnd() * 2 - 1;
      y = rnd() * 2 - 1;
      z = rnd();
      len = Math.hypot(x, y, z);
    } while (len > 1 || len < 1e-4);
    const t = i / samples;
    const scale = 0.1 + 0.9 * t * t;
    k[i * 3] = (x / len) * scale;
    k[i * 3 + 1] = (y / len) * scale;
    k[i * 3 + 2] = (z / len) * scale;
  }
  return k;
}

/** 4x4 wektorow obrotu 2D (32 floaty), znormalizowanych. */
export function makeNoise4x4(seed = 7): Float32Array {
  const rnd = mulberry32(seed);
  const n = new Float32Array(32);
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2;
    n[i * 2] = Math.cos(a);
    n[i * 2 + 1] = Math.sin(a);
  }
  return n;
}

/** Przejscie SSAO (zadanie 31). Domyslnie WYLACZONE. */
export class SsaoPass {
  enabled = false;
  private readonly opts: Required<SsaoOptions>;
  private kernelCache: Float32Array | null = null;

  constructor(opts: SsaoOptions = {}) {
    this.opts = {
      scale: opts.scale ?? 0.5,
      samples: opts.samples ?? 8,
      radiusPx: opts.radiusPx ?? 12,
      strength: opts.strength ?? 0.6,
    };
  }

  get options(): Required<SsaoOptions> {
    return this.opts;
  }

  get kernel(): Float32Array {
    this.kernelCache ??= makeHemisphereKernel(this.opts.samples);
    return this.kernelCache;
  }

  aoSize(w: number, h: number): [number, number] {
    return [
      Math.max(1, Math.ceil(w * this.opts.scale)),
      Math.max(1, Math.ceil(h * this.opts.scale)),
    ];
  }

  uniforms(): { uRadius: number; uStrength: number; uSamples: number } {
    return {
      uRadius: this.opts.radiusPx,
      uStrength: this.opts.strength,
      uSamples: this.opts.samples,
    };
  }

  isNoop(): boolean {
    return !this.enabled || this.opts.strength <= 0;
  }
}

/** Offsety probek pierscienia (piksele, zaokraglone): wspolne dla referencji CPU i shadera (uRing). */
export function ssaoRingOffsets(radiusPx: number, samples: number): [number, number][] {
  const offs: [number, number][] = [];
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    const r = i % 2 === 0 ? radiusPx : radiusPx * 0.5;
    offs.push([Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)]);
  }
  return offs;
}

/**
 * Referencja CPU prostego SSAO na mapie glebokosci (0..1, 1 = blisko kamery). Sasiad blizej
 * kamery o > 0.02 zaslania piksel. Probki: rownomierne katy, 2 promienie (0.5r, r).
 */
export function computeAoCpu(
  depth: Float32Array,
  width: number,
  height: number,
  radiusPx: number,
  strength: number,
  samples = 8,
): Uint8Array {
  const out = new Uint8Array(width * height).fill(255);
  if (strength <= 0 || samples <= 0) return out;
  const offs = ssaoRingOffsets(radiusPx, samples);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = depth[y * width + x] ?? 0;
      let occ = 0;
      for (const [dx, dy] of offs) {
        const nx = Math.min(width - 1, Math.max(0, x + dx));
        const ny = Math.min(height - 1, Math.max(0, y + dy));
        if ((depth[ny * width + nx] ?? 0) > c + 0.02) occ++;
      }
      out[y * width + x] = Math.round(255 * (1 - strength * (occ / offs.length)));
    }
  }
  return out;
}

/** Dwustronny blur AO (wagi: gauss przestrzenny * gauss po roznicy glebokosci). */
export function bilateralBlurCpu(
  ao: Uint8Array,
  depth: Float32Array,
  width: number,
  height: number,
  radius = 2,
  depthSigma = 0.05,
): Uint8Array {
  const out = new Uint8Array(width * height);
  const sr = Math.max(radius, 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cd = depth[y * width + x] ?? 0;
      let sum = 0;
      let ws = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const dz = (depth[ny * width + nx] ?? 0) - cd;
          const w =
            Math.exp(-(dx * dx + dy * dy) / (2 * sr * sr)) *
            Math.exp(-(dz * dz) / (2 * depthSigma * depthSigma));
          sum += (ao[ny * width + nx] ?? 0) * w;
          ws += w;
        }
      }
      out[y * width + x] = ws > 0 ? Math.round(sum / ws) : (ao[y * width + x] ?? 0);
    }
  }
  return out;
}
