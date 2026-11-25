import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POSTFX_PARAMS,
  PostFx,
  mergePostFxParams,
  NEUTRAL_POSTFX_PARAMS,
} from '../../src/postfx/PostFx.js';
import {
  BLOOM_BLUR_FRAG,
  BLOOM_EXTRACT_FRAG,
  POSTFX_FRAG,
  POSTFX_UNIFORM_NAMES,
} from '../../src/postfx/shaders.js';

function solid(w: number, h: number, v: number): Uint8ClampedArray {
  const a = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) a.set([v, v, v, 255], i * 4);
  return a;
}
const px = (a: Uint8ClampedArray, w: number, x: number, y: number): number => a[(y * w + x) * 4]!;

describe('PostFx', () => {
  it('neutralne parametry: wyjscie == wejscie', () => {
    const src = Uint8ClampedArray.from({ length: 8 * 8 * 4 }, (_, i) => (i * 37) & 255);
    const fx = new PostFx();
    expect(fx.enabled()).toBe(false);
    expect(Array.from(fx.process(src, 8, 8))).toEqual(Array.from(src));
  });

  it('winieta 1: rog ciemniejszy niz srodek', () => {
    const fx = new PostFx({ vignette: 1 });
    const out = fx.process(solid(33, 33, 200), 33, 33);
    expect(px(out, 33, 0, 0)).toBeLessThan(px(out, 33, 16, 16));
    expect(px(out, 33, 16, 16)).toBe(200);
  });

  it('CRT scanlines 1: nieparzyste wiersze czarne, parzyste bez zmian', () => {
    const fx = new PostFx({ crt: { enabled: true, scanlines: 1, mask: 0, curvature: 0 } });
    const out = fx.process(solid(4, 4, 120), 4, 4);
    for (let x = 0; x < 4; x++) {
      expect(px(out, 4, x, 0)).toBe(120);
      expect(px(out, 4, x, 1)).toBe(0);
      expect(px(out, 4, x, 2)).toBe(120);
    }
  });

  it('maska CRT przyciemnia kanaly poza aktywnym', () => {
    const fx = new PostFx({ crt: { enabled: true, scanlines: 0, mask: 0.5, curvature: 0 } });
    const out = fx.process(solid(3, 1, 100), 3, 1);
    expect(Array.from(out.slice(0, 3))).toEqual([100, 50, 50]);
  });

  it('gamma 2.2 rozjasnia szary 128', () => {
    const out = new PostFx({ gamma: 2.2 }).process(solid(2, 2, 128), 2, 2);
    expect(px(out, 2, 0, 0)).toBeGreaterThan(128);
  });

  it('bloom rozjasnia sasiadow jasnego bloku, alfa bez zmian', () => {
    const w = 16;
    const src = solid(w, w, 0);
    for (let y = 6; y < 10; y++)
      for (let x = 6; x < 10; x++) src.set([255, 255, 255, 255], (y * w + x) * 4);
    const out = new PostFx({ bloomStrength: 1, bloomThreshold: 0.5 }).process(src, w, w);
    expect(px(out, w, 5, 8)).toBeGreaterThan(0);
    expect(out[3]).toBe(255);
  });

  it('ziarno deterministyczne dla tego samego czasu, rozne miedzy klatkami', () => {
    const fx = new PostFx({ grain: 1 });
    const src = solid(8, 8, 128);
    const a = fx.process(src, 8, 8, 0);
    expect(Array.from(fx.process(src, 8, 8, 10))).toEqual(Array.from(a));
    expect(Array.from(fx.process(src, 8, 8, 400))).not.toEqual(Array.from(a));
  });

  it('krzywizna: rog obrazu czernieje przy duzej krzywiznie', () => {
    const fx = new PostFx({ crt: { enabled: true, scanlines: 0, mask: 0, curvature: 0.2 } });
    const out = fx.process(solid(32, 32, 200), 32, 32);
    expect(px(out, 32, 0, 0)).toBe(0);
    expect(px(out, 32, 16, 16)).toBeGreaterThan(100);
  });

  it('merge: clamp, deep merge crt, ignoruje NaN', () => {
    const m = mergePostFxParams(DEFAULT_POSTFX_PARAMS, {
      gamma: 99,
      vignette: -3,
      grain: NaN,
      crt: { curvature: 5 },
    });
    expect(m.gamma).toBe(4);
    expect(m.vignette).toBe(0);
    expect(m.grain).toBe(DEFAULT_POSTFX_PARAMS.grain);
    expect(m.crt.curvature).toBe(0.2);
    expect(m.crt.scanlines).toBe(DEFAULT_POSTFX_PARAMS.crt.scanlines);
    expect(NEUTRAL_POSTFX_PARAMS.vignette).toBe(0);
  });

  it('shadery zawieraja wszystkie uniformy i naglowek wersji', () => {
    for (const u of POSTFX_UNIFORM_NAMES) expect(POSTFX_FRAG).toContain(u);
    for (const s of [POSTFX_FRAG, BLOOM_EXTRACT_FRAG, BLOOM_BLUR_FRAG]) {
      expect(s.startsWith('#version 300 es')).toBe(true);
    }
  });
});
