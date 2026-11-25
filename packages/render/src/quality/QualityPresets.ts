/** Presety jakosci renderera (Zadanie 38/39). Czysta logika, bez GPU i DOM. */

export type QualityPreset = 'niski' | 'sredni' | 'wysoki' | 'ultra' | 'retro' | 'auto';
export type ResolvedPreset = Exclude<QualityPreset, 'auto'>;

export interface QualitySettings {
  hd: boolean;
  ktx2: boolean;
  vramBudgetBytes: number;
  normalStrength: number;
  ssao: boolean;
  shadows: 'none' | 'sun' | 'sun+points';
  postfx: { bloom: boolean; crt: boolean };
  renderScale: number;
  parallax: boolean;
  /** 1: oryginalna paleta indeksowana (tryb retro). */
  paletteMode: 0 | 1;
  lut: 'neutral' | 'bg3-warm' | 'retro-crt';
  /** CSS `image-rendering: pixelated`. */
  pixelated: boolean;
}

export interface QualityEnv {
  mobile: boolean;
  dpr: number;
  gpuTier?: 1 | 2 | 3;
}

const MB = 2 ** 20;

export const PRESET_ORDER = ['niski', 'sredni', 'wysoki', 'ultra'] as const;

export function resolveAutoPreset(env: QualityEnv): ResolvedPreset {
  if (env.mobile) return 'niski';
  if (env.gpuTier === 1) return 'sredni';
  return 'wysoki';
}

export function resolvePreset(preset: QualityPreset, env: QualityEnv): QualitySettings {
  const dpr = Number.isFinite(env.dpr) && env.dpr > 0 ? env.dpr : 1;

  const base: QualitySettings = {
    hd: true,
    ktx2: true,
    vramBudgetBytes: 192 * MB,
    normalStrength: 0,
    ssao: false,
    shadows: 'none',
    postfx: { bloom: false, crt: false },
    renderScale: Math.min(dpr, 1.5),
    parallax: false,
    paletteMode: 0,
    lut: 'neutral',
    pixelated: false,
  };

  switch (preset) {
    case 'niski':
      return base;
    case 'sredni':
      return {
        ...base,
        vramBudgetBytes: 384 * MB,
        normalStrength: 0.5,
        renderScale: Math.min(dpr, 2),
      };
    case 'wysoki':
      return {
        ...base,
        vramBudgetBytes: 768 * MB,
        normalStrength: 1,
        shadows: 'sun',
        postfx: { bloom: true, crt: false },
        renderScale: Math.min(dpr, 2),
        parallax: true,
        lut: 'bg3-warm',
      };
    case 'ultra':
      return {
        ...base,
        vramBudgetBytes: 1536 * MB,
        normalStrength: 1,
        ssao: true,
        shadows: 'sun+points',
        postfx: { bloom: true, crt: false },
        renderScale: dpr,
        parallax: true,
        lut: 'bg3-warm',
      };
    case 'retro':
      return {
        hd: false,
        ktx2: false,
        vramBudgetBytes: 64 * MB,
        normalStrength: 0,
        ssao: false,
        shadows: 'none',
        postfx: { bloom: false, crt: true },
        renderScale: 1,
        parallax: false,
        paletteMode: 1,
        lut: 'retro-crt',
        pixelated: true,
      };
    case 'auto':
      return resolvePreset(resolveAutoPreset(env), env);
  }
}

/** Obniza preset o jeden stopien, gdy srednie fps < progu (mobile 28, desktop 50). Nigdy nie podnosi. */
export function autoTune(
  stats: { fps: number },
  current: QualityPreset,
  env?: { mobile: boolean },
): QualityPreset {
  if (current === 'niski' || current === 'retro' || current === 'auto') return current;
  if (!Number.isFinite(stats.fps)) return current;
  const threshold = env?.mobile ? 28 : 50;
  if (stats.fps >= threshold) return current;
  const i = PRESET_ORDER.indexOf(current);
  return i > 0 ? PRESET_ORDER[i - 1]! : current;
}

/** Autotune z oknem czasowym (5 s) i cooldownem (max 1 zmiana na 30 s). */
export class AutoTuner {
  private readonly windowMs: number;
  private readonly cooldownMs: number;
  private readonly mobile: boolean;
  private samples: { fps: number; t: number }[] = [];
  private lastChange: number | null = null;

  constructor(opts: { mobile: boolean; windowMs?: number; cooldownMs?: number }) {
    this.mobile = opts.mobile;
    this.windowMs = opts.windowMs ?? 5000;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
  }

  sample(fps: number, nowMs: number, current: QualityPreset): QualityPreset {
    if (!Number.isFinite(fps)) return current;
    this.samples.push({ fps, t: nowMs });
    const min = nowMs - this.windowMs;
    while (this.samples.length > 0 && this.samples[0]!.t < min) this.samples.shift();
    const first = this.samples[0];
    if (!first || nowMs - first.t < this.windowMs * 0.8) return current;
    if (this.lastChange !== null && nowMs - this.lastChange < this.cooldownMs) return current;
    const mean = this.samples.reduce((s, x) => s + x.fps, 0) / this.samples.length;
    const next = autoTune({ fps: mean }, current, { mobile: this.mobile });
    if (next !== current) {
      this.lastChange = nowMs;
      this.samples = [];
    }
    return next;
  }
}
