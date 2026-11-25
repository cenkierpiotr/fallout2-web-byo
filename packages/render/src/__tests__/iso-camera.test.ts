import { describe, expect, it } from 'vitest';
import { hexToWorld } from '@f2/engine-core';
import { IsoCamera, MAP_BOUNDS } from '../iso-camera.js';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('IsoCamera', () => {
  it('roundtrip world/screen (zoom 0.5..4, dpr 1 i 2)', () => {
    const r = rng(1);
    for (const zoom of [0.5, 1, 2, 4]) {
      for (const dpr of [1, 2]) {
        const c = new IsoCamera();
        c.zoom = zoom;
        c.dpr = dpr;
        c.x = 3000 * r();
        c.y = 2000 * r();
        for (let k = 0; k < 125; k++) {
          const wx = 8000 * r() - 1000;
          const wy = 4000 * r() - 500;
          const s = c.worldToScreen(wx, wy);
          const w = c.screenToWorld(s.x, s.y);
          expect(Math.abs(w.x - wx)).toBeLessThan(1e-6);
          expect(Math.abs(w.y - wy)).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('zoomAt zachowuje punkt swiata pod kursorem i klampuje zoom', () => {
    const c = new IsoCamera();
    c.x = 2000;
    c.y = 900;
    const before = c.screenToWorld(123, 321);
    c.zoomAt(123, 321, 2);
    expect(c.zoom).toBe(2);
    const after = c.screenToWorld(123, 321);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    c.zoomAt(123, 321, 100);
    expect(c.zoom).toBe(4);
    c.zoomAt(0, 0, 0.0001);
    expect(c.zoom).toBe(0.5);
  });

  it('clampToMap ogranicza widok do obrysu mapy', () => {
    const c = new IsoCamera();
    c.x = -99999;
    c.y = -99999;
    c.clampToMap();
    let r = c.visibleWorldRect();
    expect(r.x0).toBeCloseTo(MAP_BOUNDS.x0, 6);
    expect(r.y0).toBeCloseTo(MAP_BOUNDS.y0, 6);
    c.x = 99999;
    c.y = 99999;
    c.clampToMap();
    r = c.visibleWorldRect();
    expect(r.x1).toBeCloseTo(MAP_BOUNDS.x1, 6);
    expect(r.y1).toBeCloseTo(MAP_BOUNDS.y1, 6);
    c.zoom = 0.5;
    c.viewportW = 99999;
    c.clampToMap();
    expect(c.x).toBeCloseTo((MAP_BOUNDS.x0 + MAP_BOUNDS.x1) / 2, 6);
  });

  it('centerOnHex i screenToHex w srodku widoku', () => {
    const c = new IsoCamera();
    c.centerOnHex(18492);
    const p = hexToWorld(18492);
    expect(c.x).toBe(p.x);
    expect(c.y).toBe(p.y);
    expect(c.screenToHex(c.viewportW / 2, c.viewportH / 2)).toBe(18492);
    c.x = -100000;
    expect(c.screenToHex(0, 0)).toBe(-1);
  });

  it('pan przesuwa tresc zgodnie z kursorem', () => {
    const c = new IsoCamera();
    c.zoom = 2;
    const s0 = c.worldToScreen(10, 10);
    c.pan(30, -20);
    const s1 = c.worldToScreen(10, 10);
    expect(s1.x - s0.x).toBeCloseTo(30, 9);
    expect(s1.y - s0.y).toBeCloseTo(-20, 9);
  });
});
