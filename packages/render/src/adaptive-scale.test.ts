import { describe, expect, it } from 'vitest';
import { AdaptiveScale } from './adaptive-scale.js';

function feed(a: AdaptiveScale, ms: number, n: number): number[] {
  const changes: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = a.sample(ms);
    if (c !== undefined) changes.push(c);
  }
  return changes;
}

describe('AdaptiveScale', () => {
  it('start 1, plynne 60 fps nic nie zmienia', () => {
    const a = new AdaptiveScale();
    expect(a.scale).toBe(1);
    expect(feed(a, 16.7, 600)).toEqual([]);
    expect(a.scale).toBe(1);
  });
  it('dlugie klatki obnizaja skale krokami do minimum', () => {
    const a = new AdaptiveScale();
    const ch = feed(a, 33, 2000);
    expect(ch.length).toBeGreaterThan(1);
    for (let i = 1; i < ch.length; i++) expect(ch[i]).toBeLessThan(ch[i - 1] as number);
    expect(a.scale).toBe(0.5);
  });
  it('pojedynczy zator (GC, 200 ms) nie obniza skali', () => {
    const a = new AdaptiveScale();
    feed(a, 16.7, 100);
    a.sample(200);
    feed(a, 16.7, 100);
    expect(a.scale).toBe(1);
  });
  it('klatki > 250 ms (karta w tle) sa ignorowane', () => {
    const a = new AdaptiveScale();
    feed(a, 1000, 500);
    expect(a.scale).toBe(1);
  });
  it('po poprawie wraca w gore, ale wolniej niz spada (histereza)', () => {
    const a = new AdaptiveScale();
    let down = 0;
    for (; a.scale > 0.5 && down < 5000; down++) a.sample(33);
    let up = 0;
    for (; a.scale < 1 && up < 20000; up++) a.sample(8);
    expect(a.scale).toBe(1);
    expect(up).toBeGreaterThan(down);
  });
  it('strefa pomiedzy (np. 20 ms przy budzecie 16.7) trzyma biezaca skale', () => {
    const a = new AdaptiveScale();
    feed(a, 33, 400);
    const s = a.scale;
    feed(a, 17.5, 3000);
    expect(a.scale).toBe(s);
  });
  it('reset i granice konfiguracji', () => {
    const a = new AdaptiveScale({ minScale: 0.75, step: 0.25 });
    feed(a, 40, 2000);
    expect(a.scale).toBe(0.75);
    a.reset();
    expect(a.scale).toBe(1);
  });
});
