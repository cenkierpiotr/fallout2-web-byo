import { describe, expect, it } from 'vitest';
import {
  ColorGrading,
  applyLutCpu,
  buildLut3d,
  builtinLut,
} from '../../src/lighting/color-grading.js';
import {
  DEFAULT_PARALLAX_FACTOR,
  ParallaxState,
  parallaxOffset,
  relativeParallaxShift,
} from '../../src/lighting/parallax.js';
import { COLOR_GRADING_FRAG, COLOR_GRADING_VERT } from '../../src/lighting/color-grading.js';
import { compilesOrSkip } from './gl-helper.js';

const img = (): Uint8Array => {
  const a: number[] = [];
  for (let i = 0; i < 64; i++) a.push((i * 4) & 255, (i * 9 + 3) & 255, (i * 13 + 7) & 255, 255);
  return new Uint8Array(a);
};

describe('LUT', () => {
  it('neutral: obraz identyczny (max diff 1)', () => {
    const src = img();
    const out = applyLutCpu(src, builtinLut('neutral'), 32, 1);
    let max = 0;
    for (let i = 0; i < src.length; i++)
      max = Math.max(max, Math.abs((src[i] ?? 0) - (out[i] ?? 0)));
    expect(max).toBeLessThanOrEqual(4); // kwantyzacja do 32 poziomow: <= polowa kroku (8/255), tu najblizszy
  });
  it('wymiary paska 1024x32', () => {
    const l = builtinLut('neutral');
    expect([l.width, l.height, l.data.length]).toEqual([1024, 32, 1024 * 32 * 4]);
  });
  it('bg3-warm: szare wejscie ma R > B', () => {
    const out = applyLutCpu(new Uint8Array([128, 128, 128, 255]), builtinLut('bg3-warm'), 32, 1);
    expect(out[0]!).toBeGreaterThan(out[2]!);
    expect(out[3]).toBe(255);
  });
  it('mix 0 = bez zmian', () => {
    const src = img();
    expect(Array.from(applyLutCpu(src, builtinLut('retro-crt'), 32, 0))).toEqual(Array.from(src));
  });
  it('buildLut3d wywoluje fn w 0..1 i obsluguje maly rozmiar', () => {
    const l = buildLut3d((r, g, b) => [1 - r, g, b], 2);
    expect(l.width).toBe(4);
    expect(l.data[0]).toBe(255);
  });
  it('ColorGrading domyslnie wylaczony: uMix 0', () => {
    const c = new ColorGrading();
    c.setLut('bg3-warm');
    expect(c.uniforms.uMix).toBe(0);
    c.enabled = true;
    c.setMix(0.5);
    expect(c.uniforms).toEqual({ uLutSize: 32, uMix: 0.5 });
    c.setMix(7);
    expect(c.uniforms.uMix).toBe(1);
  });
});

describe('parallax', () => {
  it('kamera o 100 px: dach +1 px wzgledem kafli przy factor 0.01, 0 przy factor 0', () => {
    expect(relativeParallaxShift(100, 0.01)).toBeCloseTo(1);
    expect(relativeParallaxShift(100, 0)).toBe(0);
    const roof = parallaxOffset([100, 0], 1, 0.01)[0];
    const tile = parallaxOffset([100, 0], 0, 0.01)[0];
    expect(roof - tile).toBeCloseTo(1);
    expect(parallaxOffset([100, 0], 1, 0)).toEqual([0, 0]);
    expect(parallaxOffset([100, 50], 0.5, 0.02)).toEqual([0, 0]);
  });
  it('domyslnie wylaczony, uniformy zerowe', () => {
    const p = new ParallaxState();
    expect(p.uniforms([10, 10])).toEqual({ uCameraDelta: [0, 0], uParallaxFactor: 0 });
    p.enabled = true;
    expect(p.uniforms([10, 10]).uParallaxFactor).toBe(DEFAULT_PARALLAX_FACTOR);
  });
});

describe('shadery', () => {
  it('zaczynaja sie od #version (bez wiodacej nowej linii)', () => {
    expect(COLOR_GRADING_FRAG.startsWith('#version 300 es')).toBe(true);
    expect(COLOR_GRADING_VERT.startsWith('#version 300 es')).toBe(true);
  });
  it.skipIf(!compilesOrSkip.available)('kompiluja sie w WebGL2', () => {
    expect(compilesOrSkip.compile(COLOR_GRADING_VERT, COLOR_GRADING_FRAG)).toBe('');
  });
});
