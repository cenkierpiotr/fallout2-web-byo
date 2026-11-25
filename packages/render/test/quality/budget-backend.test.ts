import { describe, expect, it } from 'vitest';
import { estimateBudget } from '../../src/quality/budget.js';
import { selectBackend } from '../../src/quality/backend.js';
import { resolvePreset, type QualityPreset } from '../../src/quality/QualityPresets.js';

const PIXEL7 = { width: 412, height: 839, dpr: 2.625, mobile: true };
const PRESETS: QualityPreset[] = ['niski', 'sredni', 'wysoki', 'ultra', 'retro'];

describe('estimateBudget (mobile)', () => {
  it('auto na Pixel 7 miesci sie w budzecie 192 MB i fill', () => {
    const q = resolvePreset('auto', PIXEL7);
    const e = estimateBudget(q, PIXEL7);
    expect(e.verdict.fits).toBe(true);
    expect(e.fullscreenPasses).toBe(1);
  });
  it('retro miesci sie, ultra na telefonie nie (pamiec tekstur 1536 MB)', () => {
    expect(estimateBudget(resolvePreset('retro', PIXEL7), PIXEL7).verdict.fits).toBe(true);
    const u = estimateBudget(resolvePreset('ultra', PIXEL7), PIXEL7);
    expect(u.verdict.fits).toBe(false);
    expect(u.verdict.reasons.length).toBeGreaterThan(0);
  });
  it('koszt rosnie monotonicznie z presetem (niski <= sredni <= wysoki <= ultra), liczba passow ultra = 9', () => {
    const f = PRESETS.slice(0, 4).map((p) => estimateBudget(resolvePreset(p, PIXEL7), PIXEL7));
    for (let i = 1; i < f.length; i++)
      expect(f[i]!.fullscreenPasses).toBeGreaterThanOrEqual(f[i - 1]!.fullscreenPasses);
    // scena 1 + cien 2 + punkty 2 + SSAO 2 + bloom 3 + grading 1
    expect(f[3]!.fullscreenPasses).toBe(11);
  });
  it('bufor renderu na telefonie ograniczony do ~1.6 MPx', () => {
    const e = estimateBudget(resolvePreset('ultra', PIXEL7), PIXEL7);
    expect(e.renderPixels).toBeLessThanOrEqual(1.6e6);
  });
  it('ultra z limitem desktop miesci sie na 1080p', () => {
    const env = { width: 1920, height: 1080, dpr: 1, mobile: false };
    expect(estimateBudget(resolvePreset('ultra', env), env).verdict.fits).toBe(true);
  });
});

describe('selectBackend', () => {
  const base = {
    hasWebGpu: true,
    webgpuFlag: true,
    webgpuBackendRegistered: true,
    adapterOk: true,
  };
  it('flaga off: zawsze webgl2', () => {
    expect(selectBackend({ ...base, webgpuFlag: false })).toEqual({ backend: 'webgl2' });
  });
  it('wszystko spelnione: webgpu', () => {
    expect(selectBackend(base).backend).toBe('webgpu');
  });
  it.each([
    [{ ios: true }, 'ios'],
    [{ hasWebGpu: false }, 'no-navigator-gpu'],
    [{ webgpuBackendRegistered: false }, 'backend-not-registered'],
    [{ adapterOk: false }, 'no-adapter'],
  ])('fallback %j -> webgl2 (%s)', (patch, reason) => {
    expect(selectBackend({ ...base, ...patch })).toEqual({
      backend: 'webgl2',
      fallbackReason: reason,
    });
  });
});
