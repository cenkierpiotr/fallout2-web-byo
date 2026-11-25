import { builtinLut, type RgbaImage } from './lighting/color-grading.js';
import type { ShadowOptions } from './lighting/shadow-pass.js';
import type { SsaoOptions } from './lighting/ssao-pass.js';
import {
  DEFAULT_POSTFX_PARAMS,
  NEUTRAL_POSTFX_PARAMS,
  isNeutralPostFx,
  mergePostFxParams,
  type PostFxParams,
} from './postfx/PostFx.js';
import type { QualitySettings } from './quality/QualityPresets.js';

/**
 * Konfiguracja petli passow renderu (GfxDevice.setPostProcess). Kazda sekcja null/brak = pass
 * wylaczony; null albo konfiguracja bez aktywnych passow = klasyczny render, bajt w bajt.
 * Cienie i SSAO dzialaja tylko przy wlaczonym oswietleniu 2.5D (potrzebuja slonca / glebi).
 */
export interface PostProcessConfig {
  /** Miekkie cienie sloneczne obiektow (warstwa 0.5), maska + rozmycie, mnozona do ambientu. */
  shadows?: ShadowOptions | null;
  /** SSAO polrozdzielczosciowe z dwustronnym rozmyciem, mnozone na gotowa scene. */
  ssao?: SsaoOptions | null;
  /** Color grading 3D LUT (pasek N*N x N); mix 0..1. */
  grading?: { lut: RgbaImage; mix: number } | null;
  /** Bloom, gamma, winieta, ziarno, CRT. */
  postFx?: PostFxParams | null;
  /** Czas w ms (ziarno). */
  time?: number;
}

export function isPostProcessActive(cfg: PostProcessConfig | null | undefined): boolean {
  if (!cfg) return false;
  return !!(
    cfg.shadows ||
    cfg.ssao ||
    (cfg.grading && cfg.grading.mix > 0) ||
    (cfg.postFx && !isNeutralPostFx(cfg.postFx))
  );
}

const lutCache = new Map<string, RgbaImage>();

/**
 * Tlumaczy preset jakosci na konfiguracje passow. `enabled` to glowny wlacznik (ustawienie
 * `postFx` w grze, domyslnie false): przy false zwraca null, czyli sciezka klasyczna.
 * 'sun+points' dodaje cienie radialne od swiatel punktowych (ShadowOptions.points).
 */
export function postProcessFromQuality(
  q: QualitySettings,
  opts: { enabled: boolean; time?: number },
): PostProcessConfig | null {
  if (!opts.enabled) return null;
  const cfg: PostProcessConfig = { time: opts.time ?? 0 };
  if (q.shadows !== 'none') cfg.shadows = q.shadows === 'sun+points' ? { points: true } : {};
  if (q.ssao) cfg.ssao = {};
  if (q.lut !== 'neutral') {
    let lut = lutCache.get(q.lut);
    if (!lut) {
      lut = builtinLut(q.lut, 16);
      lutCache.set(q.lut, lut);
    }
    cfg.grading = { lut, mix: 1 };
  }
  if (q.postfx.bloom || q.postfx.crt) {
    const params = mergePostFxParams(NEUTRAL_POSTFX_PARAMS, {
      bloomStrength: q.postfx.bloom ? DEFAULT_POSTFX_PARAMS.bloomStrength : 0,
      crt: { enabled: q.postfx.crt },
    });
    if (!isNeutralPostFx(params)) cfg.postFx = params;
  }
  return isPostProcessActive(cfg) ? cfg : null;
}
