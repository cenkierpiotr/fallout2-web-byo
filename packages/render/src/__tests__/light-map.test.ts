import { describe, expect, it } from 'vitest';
import { hexInDirection } from '@f2/engine-core';
import { LightMap } from '../light-map.js';
import { mapWith, obj } from './helpers.js';

const SRC = 0x20;
const center = 20100;

function src(p: Record<string, unknown> = {}) {
  return obj({ hex: center, flags: SRC, lightRadius: 8, lightIntensity: 0x10000, ...p });
}

describe('LightMap', () => {
  it('pojedyncze zrodlo: 1.0 w heksie, spadek liniowy, 0 poza promieniem', () => {
    const lm = new LightMap();
    lm.rebuildStatic(mapWith([src()]), 0, 0);
    expect(lm.intensityAt(center)).toBe(1);
    const step = Math.trunc((0x10000 - 0x28f) / 9);
    const at8 = hexInDirection(center, 0, 8);
    expect(lm.intensityAt(at8)).toBeCloseTo((0x10000 - 8 * step) / 0x10000, 5);
    const at3 = hexInDirection(center, 3, 3);
    expect(lm.intensityAt(at3)).toBeCloseTo((0x10000 - 3 * step) / 0x10000, 5);
    expect(lm.intensityAt(hexInDirection(center, 0, 9))).toBe(0);
    expect(lm.texture().length).toBe(200 * 200);
  });

  it('podloga swiatla globalnego', () => {
    const lm = new LightMap();
    lm.rebuildStatic(mapWith([src()]), 0, 0.25);
    expect(lm.intensityAt(hexInDirection(center, 0, 20))).toBe(0.25);
    expect(lm.intensityAt(center)).toBe(1);
    expect(Math.min(...lm.texture())).toBeGreaterThanOrEqual(0.25);
  });

  it('ignoruje ukryte, bez flagi 0x20, inny poziom', () => {
    const lm = new LightMap();
    const m = mapWith([src({ flags: SRC | 1 }), src({ flags: 0 }), src({ elevation: 1 })]);
    lm.rebuildStatic(m, 0, 0);
    expect(lm.intensityAt(center)).toBe(0);
  });

  it('promien 0 oswietla tylko wlasny heks (0x48dc48 sprawdza tylko intensywnosc)', () => {
    const lm = new LightMap();
    lm.rebuildStatic(mapWith([src({ lightRadius: 0 })]), 0, 0);
    expect(lm.intensityAt(center)).toBe(1);
    expect(lm.intensityAt(hexInDirection(center, 0, 1))).toBe(0);
  });

  it('zrodla sumuja sie, obciete do 1', () => {
    const lm = new LightMap();
    lm.rebuildStatic(mapWith([src(), src({ id: 2 })]), 0, 0);
    expect(lm.intensityAt(center)).toBe(1);
    expect(lm.intensityAt(hexInDirection(center, 0, 8))).toBeLessThanOrEqual(1);
  });
});

describe('LightMap: intensywnosc ponizej bazy', () => {
  it('krok ujemny (idiv 0x48dd49): swiatlo jasniejsze ku brzegom jak w exe', () => {
    const lm = new LightMap();
    lm.rebuildStatic(mapWith([src({ lightIntensity: 0x100, lightRadius: 4 })]), 0, 0);
    const c = lm.intensityAt(center);
    expect(lm.intensityAt(hexInDirection(center, 0, 4))).toBeGreaterThan(c);
  });
});

describe('LightMap: wylaczenie zrodel i statystyki', () => {
  it('setSourcesEnabled(false) zostawia sama podloge, true przywraca zrodla', () => {
    const lm = new LightMap();
    lm.rebuildStatic(mapWith([src()]), 0, 0.25);
    const n = lm.litHexCount();
    expect(n).toBeGreaterThan(1);
    expect(lm.intensityAt(center)).toBe(1);
    lm.setSourcesEnabled(false);
    expect(lm.sourcesEnabled).toBe(false);
    expect(lm.intensityAt(center)).toBe(0.25);
    lm.setAmbient(0.5);
    expect(lm.intensityAt(center)).toBe(0.5);
    lm.setSourcesEnabled(true);
    expect(lm.intensityAt(center)).toBe(1);
    expect(lm.litHexCount()).toBe(n);
  });
});
