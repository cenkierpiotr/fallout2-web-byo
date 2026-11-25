import { describe, expect, it } from 'vitest';
import {
  SsaoPass,
  bilateralBlurCpu,
  computeAoCpu,
  makeHemisphereKernel,
  makeNoise4x4,
} from '../../src/lighting/ssao-pass.js';
import { BILATERAL_FRAG, SSAO_FRAG, SSAO_VERT } from '../../src/lighting/shaders-ssao.js';
import { compilesOrSkip } from './gl-helper.js';

const W = 64;
const H = 64;

describe('SSAO CPU', () => {
  it('plaska podloga: AO > 250 srednio', () => {
    const d = new Float32Array(W * H).fill(0.5);
    const ao = computeAoCpu(d, W, H, 12, 0.6);
    const mean = ao.reduce((a, b) => a + b, 0) / ao.length;
    expect(mean).toBeGreaterThan(250);
  });
  it('sciana przy podlodze: AO przy podstawie < 200', () => {
    const d = new Float32Array(W * H).fill(0.3);
    for (let y = 0; y < H; y++) for (let x = 32; x < W; x++) d[y * W + x] = 0.9; // sciana (blizej)
    const ao = computeAoCpu(d, W, H, 12, 1, 8);
    const nearBase = ao[32 * W + 28] ?? 255;
    expect(nearBase).toBeLessThan(200);
  });
  it('strength 0: 255 wszedzie', () => {
    const d = new Float32Array(W * H);
    for (let i = 0; i < d.length; i++) d[i] = (i % 7) / 7;
    expect(computeAoCpu(d, W, H, 12, 0).every((v) => v === 255)).toBe(true);
  });
  it('bilateral zachowuje krawedz po glebokosci', () => {
    const d = new Float32Array(W * H).fill(0.2);
    const ao = new Uint8Array(W * H).fill(255);
    for (let y = 0; y < H; y++)
      for (let x = 32; x < W; x++) {
        d[y * W + x] = 0.9;
        ao[y * W + x] = 100;
      }
    const b = bilateralBlurCpu(ao, d, W, H);
    expect(b[10 * W + 31]).toBe(255);
    expect(b[10 * W + 32]).toBe(100);
  });
});

describe('SsaoPass', () => {
  it('domyslnie wylaczony, noop', () => {
    const p = new SsaoPass();
    expect(p.enabled).toBe(false);
    expect(p.isNoop()).toBe(true);
    p.enabled = true;
    expect(p.isNoop()).toBe(false);
    expect(new SsaoPass({ strength: 0 }).isNoop()).toBe(true);
  });
  it('aoSize polowa, min 1; jadro deterministyczne w polsferze', () => {
    const p = new SsaoPass();
    expect(p.aoSize(101, 50)).toEqual([51, 25]);
    expect(p.aoSize(1, 1)).toEqual([1, 1]);
    const k = makeHemisphereKernel(8);
    expect(k.length).toBe(24);
    for (let i = 0; i < 8; i++) expect(k[i * 3 + 2]).toBeGreaterThanOrEqual(0);
    expect(Array.from(makeHemisphereKernel(8))).toEqual(Array.from(k));
    expect(makeNoise4x4().length).toBe(32);
  });
});

describe('shadery', () => {
  it('zawieraja uniformy i nie uzywaja slowa zastrzezonego sample', () => {
    expect(SSAO_FRAG).toContain('uKernel[8]');
    expect(SSAO_FRAG).not.toMatch(/\bsample\b/);
    expect(BILATERAL_FRAG).toContain('uDirection');
  });
  it.skipIf(!compilesOrSkip.available)('kompiluja sie w WebGL2', () => {
    expect(compilesOrSkip.compile(SSAO_VERT, SSAO_FRAG)).toBe('');
    expect(compilesOrSkip.compile(SSAO_VERT, BILATERAL_FRAG)).toBe('');
  });
});
