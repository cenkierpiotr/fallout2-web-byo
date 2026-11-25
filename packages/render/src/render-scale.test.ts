import { describe, expect, it } from 'vitest';
import { MAX_RENDER_PIXELS, renderDpr, scaledDpr } from './render-scale.js';

describe('renderDpr', () => {
  it('desktop 1080p dpr 1 zostaje natywny', () => {
    expect(renderDpr(1920, 1080, 1)).toBe(1);
  });
  it('telefon (Pixel 7) dostaje nizszy dpr i mieści sie w limicie pikseli', () => {
    const d = renderDpr(412, 915, 2.625);
    expect(d).toBeLessThan(2.625);
    expect(d).toBeGreaterThanOrEqual(1);
    expect(412 * 915 * d * d).toBeLessThanOrEqual(MAX_RENDER_PIXELS);
  });
  it('maly ekran z dpr 2 nie jest ograniczany', () => {
    expect(renderDpr(390, 400, 2)).toBe(2);
  });
  it('nigdy nie wyzej niz dpr urzadzenia ani nizej niz 1', () => {
    expect(renderDpr(100, 100, 1.5)).toBe(1.5);
    expect(renderDpr(4000, 3000, 3)).toBe(1);
    expect(renderDpr(1920, 1080, 0)).toBe(1);
    expect(renderDpr(1920, 1080, NaN)).toBe(1);
  });
  it('krok 0.25', () => {
    const d = renderDpr(412, 915, 3);
    expect((d * 4) % 1).toBe(0);
  });
});

describe('scaledDpr', () => {
  it('skala 1 nie zmienia, nizsza skaluje z krokiem 0.125 i dolnym limitem 0.5', () => {
    expect(scaledDpr(2, 1)).toBe(2);
    expect(scaledDpr(2, 0.75)).toBe(1.5);
    expect(scaledDpr(1, 0.5)).toBe(0.5);
    expect(scaledDpr(1, 0.3)).toBe(0.5);
    expect(scaledDpr(1.75, 0.875)).toBe(1.5);
    expect(scaledDpr(2, NaN)).toBe(2);
    expect(scaledDpr(2, 3)).toBe(2);
  });
});
