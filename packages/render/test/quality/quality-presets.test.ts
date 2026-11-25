import { describe, expect, it } from 'vitest';
import {
  AutoTuner,
  autoTune,
  resolveAutoPreset,
  resolvePreset,
} from '../../src/quality/QualityPresets.js';

describe('resolvePreset', () => {
  it('auto na mobile = niski z budzetem 192 MB', () => {
    const s = resolvePreset('auto', { mobile: true, dpr: 3 });
    expect(s.vramBudgetBytes).toBe(192 * 2 ** 20);
    expect(s.ssao).toBe(false);
    expect(s.renderScale).toBe(1.5);
    expect(s.shadows).toBe('none');
    expect(s.normalStrength).toBe(0);
  });
  it('auto na desktopie = wysoki, gpuTier 1 = sredni', () => {
    expect(resolveAutoPreset({ mobile: false, dpr: 1 })).toBe('wysoki');
    expect(resolveAutoPreset({ mobile: false, dpr: 1, gpuTier: 1 })).toBe('sredni');
  });
  it('zly dpr traktowany jak 1', () => {
    expect(resolvePreset('ultra', { mobile: false, dpr: NaN }).renderScale).toBe(1);
  });
  it('retro: bez HD, CRT, paleta indeksowana', () => {
    const s = resolvePreset('retro', { mobile: false, dpr: 2 });
    expect(s.hd).toBe(false);
    expect(s.postfx.crt).toBe(true);
    expect(s.paletteMode).toBe(1);
    expect(s.lut).toBe('retro-crt');
    expect(s.renderScale).toBe(1);
    expect(s.pixelated).toBe(true);
    expect(s.parallax).toBe(false);
  });
});

describe('autoTune', () => {
  it('obniza o stopien', () => {
    expect(autoTune({ fps: 20 }, 'sredni')).toBe('niski');
    expect(autoTune({ fps: 40 }, 'ultra')).toBe('wysoki');
  });
  it('nie podnosi i nie rusza niski/retro', () => {
    expect(autoTune({ fps: 60 }, 'niski')).toBe('niski');
    expect(autoTune({ fps: 5 }, 'retro')).toBe('retro');
    expect(autoTune({ fps: 60 }, 'sredni')).toBe('sredni');
  });
  it('prog mobile 28', () => {
    expect(autoTune({ fps: 40 }, 'wysoki', { mobile: true })).toBe('wysoki');
    expect(autoTune({ fps: 25 }, 'wysoki', { mobile: true })).toBe('sredni');
  });
});

describe('AutoTuner', () => {
  it('wymaga pokrycia okna i respektuje cooldown 30 s', () => {
    const t = new AutoTuner({ mobile: false });
    let p = t.sample(20, 0, 'ultra');
    expect(p).toBe('ultra');
    for (let ms = 1000; ms <= 4000; ms += 1000) p = t.sample(20, ms, 'ultra');
    expect(p).toBe('wysoki');
    // kolejna zmiana w cooldownie ignorowana
    for (let ms = 5000; ms <= 20_000; ms += 1000) p = t.sample(20, ms, p);
    expect(p).toBe('wysoki');
    for (let ms = 21_000; ms <= 40_000; ms += 1000) p = t.sample(20, ms, p);
    expect(p).toBe('sredni');
  });
  it('dobre fps nic nie zmienia', () => {
    const t = new AutoTuner({ mobile: false });
    let p: ReturnType<typeof t.sample> = 'wysoki';
    for (let ms = 0; ms <= 10_000; ms += 500) p = t.sample(60, ms, 'wysoki');
    expect(p).toBe('wysoki');
  });
});
