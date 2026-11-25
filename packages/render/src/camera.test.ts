import { describe, expect, it } from 'vitest';
import { Camera2D } from './camera.js';

describe('Camera2D', () => {
  it('klampuje zoom', () => {
    const c = new Camera2D();
    c.setZoom(9);
    expect(c.zoom).toBe(4);
    c.setZoom(0.1);
    expect(c.zoom).toBe(0.5);
  });
  it('deviceZoom mnozy zoom przez dpr (kamera w px CSS)', () => {
    const c = new Camera2D();
    c.zoom = 2;
    expect(c.deviceZoom(1.5)).toBe(3);
    c.zoom = 2.4;
    c.snapInteger = true;
    expect(c.deviceZoom(2)).toBe(4);
  });
  it('snapInteger zaokragla zoom', () => {
    const c = new Camera2D();
    c.zoom = 2.4;
    expect(c.effectiveZoom()).toBe(2.4);
    c.snapInteger = true;
    expect(c.effectiveZoom()).toBe(2);
    c.zoom = 0.5;
    expect(c.effectiveZoom()).toBe(1);
  });
  it('worldToScreen wysrodkowuje swiat', () => {
    const c = new Camera2D();
    c.zoom = 2;
    expect(c.worldToScreen(0, 0, 800, 600)).toEqual([400, 300]);
  });
  it('screenToWorld odwraca worldToScreen', () => {
    const c = new Camera2D();
    c.x = 5;
    c.y = -7;
    c.zoom = 1.5;
    const [sx, sy] = c.worldToScreen(10, 20, 800, 600);
    const [wx, wy] = c.screenToWorld(sx, sy, 800, 600);
    expect(wx).toBeCloseTo(10);
    expect(wy).toBeCloseTo(20);
  });
});
