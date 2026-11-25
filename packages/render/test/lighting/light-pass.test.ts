import { describe, expect, it } from 'vitest';
import {
  LightPass,
  attenuation,
  lambertAtPoint,
  packLights,
  shadePixel,
} from '../../src/lighting/light-pass.js';
import { DEFAULT_LIGHTING_FLAGS, makeLightingFlags } from '../../src/lighting/flags.js';
import type { PointLight } from '../../src/lighting/types.js';
import { SPRITE_LIT_FRAG, SPRITE_LIT_VERT } from '../../src/lighting/shaders-light.js';
import { compilesOrSkip } from './gl-helper.js';

const light = (x: number, y: number, over: Partial<PointLight> = {}): PointLight => ({
  x,
  y,
  z: 0.3,
  color: [1, 1, 1],
  radius: 100,
  intensity: 1,
  ...over,
});

describe('flagi i domyslne wylaczenie', () => {
  it('wszystkie passy domyslnie wylaczone', () => {
    expect(Object.values(DEFAULT_LIGHTING_FLAGS).every((v) => v === false)).toBe(true);
    expect(makeLightingFlags({ ssaoPass: true }).ssaoPass).toBe(true);
  });
  it('LightPass domyslnie wylaczony: sila normali 0, brak swiatel w uniformach', () => {
    const p = new LightPass();
    p.setLights([light(0, 0)]);
    expect(p.enabled).toBe(false);
    expect(p.effectiveNormalStrength()).toBe(0);
    expect(p.uniforms().uLightCount).toBe(0);
    p.enabled = true;
    expect(p.effectiveNormalStrength()).toBe(0.6);
    expect(p.uniforms().uLightCount).toBe(1);
  });
});

describe('packLights', () => {
  it('17 swiatel -> 16 uzytych, bufor stalej dlugosci', () => {
    const many = Array.from({ length: 17 }, (_, i) => light(i, 0));
    const { data, count } = packLights(many);
    expect(count).toBe(16);
    expect(data.length).toBe(128);
    expect(data[15 * 8]).toBe(15);
  });
  it('uklad: pos+radius, color+intensity', () => {
    const { data } = packLights([
      light(1, 2, { radius: 7, intensity: 0.5, color: [0.1, 0.2, 0.3] }),
    ]);
    expect(Array.from(data.slice(0, 8))).toEqual(
      [1, 2, 0.3, 7, 0.1, 0.2, 0.3, 0.5].map(Math.fround),
    );
  });
  it('setSunDir normalizuje, zero daje [0,0,1]', () => {
    const p = new LightPass();
    p.setSunDir([0, 0, 0]);
    expect(p.uniforms().uSunDir).toEqual([0, 0, 1]);
    p.setSunDir([3, 0, 4]);
    expect(p.uniforms().uSunDir[0]).toBeCloseTo(0.6);
  });
});

describe('model oswietlenia (referencja CPU)', () => {
  it('attenuation i lambert', () => {
    expect(attenuation(0, 10)).toBe(1);
    expect(attenuation(10, 10)).toBe(0);
    expect(attenuation(5, 0)).toBe(0);
    expect(lambertAtPoint([0, 0, 1], [0, 0, 1])).toBe(1);
    expect(lambertAtPoint([0, 0, 1], [0, 0, -1])).toBe(0);
  });
  it('plaski sprite: srodek pod swiatlem jasniejszy niz brzeg', () => {
    const L = [light(0, 0, { radius: 50 })];
    const center = shadePixel([0.5, 0.5, 0.5], [0, 0, 1], [0, 0, 0], [0.2, 0.2, 0.2], 1, L, 1);
    const edge = shadePixel([0.5, 0.5, 0.5], [0, 0, 1], [40, 0, 0], [0.2, 0.2, 0.2], 1, L, 1);
    expect(center[0]).toBeGreaterThan(edge[0]);
  });
  it('normalStrength 0 = render bez normal map (rozni sie max 1/255 od baseline)', () => {
    const L = [light(0, 0, { radius: 50 })];
    const tilted = shadePixel([0.5, 0.5, 0.5], [0.7, 0, 0.7], [10, 0, 0], [0.2, 0.2, 0.2], 1, L, 0);
    const flat = shadePixel([0.5, 0.5, 0.5], [0, 0, 1], [10, 0, 0], [0.2, 0.2, 0.2], 1, L, 0);
    for (let c = 0; c < 3; c++)
      expect(Math.abs(tilted[c]! - flat[c]!)).toBeLessThanOrEqual(1 / 255);
  });
  it('17 swiatel liczone jako 16', () => {
    const l16 = Array.from({ length: 16 }, () => light(0, 0));
    const l17 = [...l16, light(0, 0)];
    expect(shadePixel([0.1, 0.1, 0.1], [0, 0, 1], [0, 0, 0], [0, 0, 0], 0, l17, 1)).toEqual(
      shadePixel([0.1, 0.1, 0.1], [0, 0, 1], [0, 0, 0], [0, 0, 0], 0, l16, 1),
    );
  });
});

describe('shadery (kompilacja pomijana bez WebGL)', () => {
  it('zawieraja wymagane uniformy', () => {
    for (const u of [
      'uAtlas',
      'uAtlasNormal',
      'uAtlasDepth',
      'uLightMap',
      'uNormalStrength',
      'uLightCount',
    ]) {
      expect(SPRITE_LIT_FRAG).toContain(u);
    }
    expect(SPRITE_LIT_VERT).toContain('uParallaxFactor');
  });
  it.skipIf(!compilesOrSkip.available)('kompiluje sie w WebGL2', () => {
    expect(compilesOrSkip.compile(SPRITE_LIT_VERT, SPRITE_LIT_FRAG)).toBe('');
  });
});
