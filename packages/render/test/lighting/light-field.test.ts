import { describe, expect, it } from 'vitest';
import { makeHex } from '@f2/engine-core';
import { LightField } from '../../src/lighting/light-field.js';
import { averageCycleColor, emissiveLightColor } from '../../src/lighting/emissive-color.js';
import type { MapLightSource } from '../../src/lighting/types.js';

const at = (f: LightField, x: number, y: number): number => f.texture[(y * 200 + x) * 3] ?? -1;

describe('LightField', () => {
  const src: MapLightSource = { hex: makeHex(100, 100), elevation: 0, intensity: 65536, radius: 8 };

  it('zrodlo daje 255 w swoim hexie, ambient 9 hex dalej', () => {
    const f = new LightField();
    f.update([src], 0.2, 0);
    expect(at(f, 100, 100)).toBe(255);
    expect(at(f, 109, 100)).toBe(Math.round(0.2 * 255));
    expect(at(f, 104, 100)).toBeGreaterThan(Math.round(0.2 * 255));
  });
  it('zrodlo z innego pietra jest ignorowane', () => {
    const f = new LightField();
    f.update([src], 0.2, 1);
    expect(at(f, 100, 100)).toBe(51);
    expect(f.pointLights({ x0: 0, y0: 0, x1: 199, y1: 199 })).toHaveLength(0);
  });
  it('dirty: true po pierwszym update, false po markClean i identycznym update', () => {
    const f = new LightField();
    f.update([src], 0.2, 0);
    expect(f.dirty).toBe(true);
    f.markClean();
    f.update([src], 0.2, 0);
    expect(f.dirty).toBe(false);
    f.update([src], 0.5, 0);
    expect(f.dirty).toBe(true);
  });
  it('kolor zrodla trafia do kanalow', () => {
    const f = new LightField();
    f.update([{ ...src, color: [255, 0, 0] }], 0, 0);
    expect(f.texture[(100 * 200 + 100) * 3 + 1]).toBe(0);
    expect(f.texture[(100 * 200 + 100) * 3]).toBe(255);
  });
  it('pointLights: max 16 najblizszych srodka viewportu', () => {
    const f = new LightField();
    const many: MapLightSource[] = [];
    for (let i = 0; i < 30; i++) {
      many.push({ hex: makeHex(10 + i * 5, 100), elevation: 0, intensity: 40000, radius: 2 });
    }
    f.update(many, 0.1, 0);
    const vp = { x0: 0, y0: 90, x1: 199, y1: 110 };
    const l = f.pointLights(vp);
    expect(l).toHaveLength(16);
    const mid = f.pointLights(vp, 1)[0]!;
    // najblizsze srodka (x=99.5): kolumna 100 lub 95
    expect(Math.abs(mid.x - l[0]!.x)).toBe(0);
    expect(l[0]!.z).toBe(0.3);
    expect(l[0]!.radius).toBe(32);
    expect(f.pointLights(vp, 0)).toEqual([]);
  });
  it('pointLights: zrodla poza viewportem odpadaja', () => {
    const f = new LightField();
    f.update([src], 0.1, 0);
    expect(f.pointLights({ x0: 0, y0: 0, x1: 20, y1: 20 })).toHaveLength(0);
    expect(f.pointLights({ x0: 95, y0: 95, x1: 105, y1: 105 })).toHaveLength(1);
  });
  it('zrodla poza siatka sa ignorowane', () => {
    const f = new LightField();
    expect(() =>
      f.update(
        [
          { ...src, hex: -1 },
          { ...src, hex: 40000 },
        ],
        0.1,
        0,
      ),
    ).not.toThrow();
  });
});

describe('emissive-color', () => {
  it('srednia cyklu', () => {
    const p = new Uint8Array(768);
    p.set([10, 20, 30, 30, 40, 50], 0);
    expect(averageCycleColor(p, 0, 1)).toEqual([20, 30, 40]);
    expect(() => averageCycleColor(p, 5, 2)).toThrow(RangeError);
    expect(() => averageCycleColor(new Uint8Array(10), 0, 1)).toThrow(RangeError);
    expect(emissiveLightColor('fire')[0]).toBe(255);
  });
});
