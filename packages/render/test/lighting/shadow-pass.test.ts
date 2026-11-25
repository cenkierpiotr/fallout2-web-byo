import { describe, expect, it } from 'vitest';
import {
  ShadowPass,
  blurRow,
  gaussianKernel,
  pickShadowLights,
  projectRadial,
  projectShadowPoint,
  rasterizeSunShadowCpu,
  sunSkewMatrix,
} from '../../src/lighting/shadow-pass.js';
import { SHADOW_FRAG, SHADOW_VERT } from '../../src/lighting/shaders-shadow.js';
import type { PointLight } from '../../src/lighting/types.js';
import { compilesOrSkip } from './gl-helper.js';

const pl = (intensity: number, radius: number): PointLight => ({
  x: 0,
  y: 0,
  z: 0.3,
  color: [1, 1, 1],
  radius,
  intensity,
});

/** Sprite 5 szer. x 10 wys.: slupek w kolumnie 2, wiersze 0..8. Cien na planszy 21x21 po srodku. */
function scene(): { alpha: Uint8Array; w: number; h: number } {
  const w = 21;
  const h = 21;
  const alpha = new Uint8Array(w * h);
  for (let y = 5; y <= 15; y++) alpha[y * w + 10] = 255;
  return { alpha, w, h };
}

describe('rzut slonecznego cienia', () => {
  it('dir (1,-1,0.5): cien w prawo i w dol od wierzcholka, nie nad slupkiem', () => {
    expect(sunSkewMatrix([1, -1, 0.5])).toEqual([1, 0, 0, 0, 1, 0, 2, 2, 1]);
    const [x, y] = projectShadowPoint([1, -1, 0.5], 10, 5, 1);
    expect(x).toBeGreaterThan(10);
    expect(y).toBeGreaterThan(5);
    const { alpha, w, h } = scene();
    const m = rasterizeSunShadowCpu(alpha, w, h, [1, -1, 0.5], 0.1, 0.45, 1);
    // wierzcholek slupka (10,5), hp=15*0.1=1.5 -> (13,8): ciemny po prawej-dolnej
    expect(m[8 * w + 13]).toBeLessThan(255);
    // nad slupkiem brak cienia
    for (let y = 0; y < 5; y++) for (let x = 0; x < w; x++) expect(m[y * w + x]).toBe(255);
  });
  it('intensity 0 i brak swiatel: maska cala 255, pass noop', () => {
    const { alpha, w, h } = scene();
    expect(
      rasterizeSunShadowCpu(alpha, w, h, [1, -1, 0.5], 0.1, 0.45, 0).every((v) => v === 255),
    ).toBe(true);
    const p = new ShadowPass();
    p.enabled = true;
    expect(p.isNoop({ dir: [1, -1, 0.5], intensity: 0 }, [])).toBe(true);
    expect(p.isNoop({ dir: [1, -1, 0.5], intensity: 1 }, [])).toBe(false);
  });
  it('domyslnie wylaczony', () => {
    expect(new ShadowPass().enabled).toBe(false);
    expect(new ShadowPass().isNoop({ dir: [1, 1, 1], intensity: 1 }, [pl(1, 1)])).toBe(true);
  });
});

describe('blur', () => {
  it('blur 3 daje szersza krawedz (gradient > 2 px) niz blur 0', () => {
    const w = 20;
    const src = new Uint8Array(w).fill(255);
    for (let x = 10; x < w; x++) src[x] = 100;
    const grad = (a: Uint8Array): number => a.filter((v) => v > 100 && v < 255).length;
    expect(grad(blurRow(src, w, 1, 0))).toBe(0);
    expect(grad(blurRow(src, w, 1, 3))).toBeGreaterThan(2);
  });
  it('jadro znormalizowane', () => {
    const k = gaussianKernel(3);
    expect(k.length).toBe(7);
    expect(k.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    expect(Array.from(gaussianKernel(0))).toEqual([1]);
  });
});

describe('swiatla punktowe', () => {
  it('pickShadowLights: 4 najjasniejsze', () => {
    const l = [pl(1, 1), pl(5, 5), pl(3, 3), pl(4, 4), pl(2, 2), pl(6, 6)];
    expect(pickShadowLights(l).map((x) => x.intensity)).toEqual([6, 5, 4, 3]);
  });
  it('projectRadial odsuwa cien od swiatla', () => {
    const [x] = projectRadial({ ...pl(1, 1), x: 0, y: 0, z: 10 }, 5, 0, 5);
    expect(x).toBe(10);
    expect(projectRadial({ ...pl(1, 1), z: 1 }, 5, 7, 2)).toEqual([5, 7]);
  });
});

describe('shadery', () => {
  it('zawieraja uniformy', () => {
    expect(SHADOW_VERT).toContain('uSkew');
    expect(SHADOW_FRAG).toContain('uAlphaAtlas');
  });
  it.skipIf(!compilesOrSkip.available)('kompiluje sie w WebGL2', () => {
    expect(compilesOrSkip.compile(SHADOW_VERT, SHADOW_FRAG)).toBe('');
  });
});
