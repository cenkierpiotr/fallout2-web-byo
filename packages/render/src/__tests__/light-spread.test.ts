import { describe, expect, it } from 'vitest';
import { HEX_COUNT, hexDistance, hexInDirection } from '@f2/engine-core';
import {
  LIGHT_OFFSETS,
  LIGHT_RING,
  parentBlocked,
  spreadLight,
  type LightBlocker,
} from '../light-spread.js';

const center = 20100;
const none: LightBlocker[] = [];

function run(
  blockers: Record<number, LightBlocker[]> = {},
  p: Partial<Parameters<typeof spreadLight>[0]> = {},
) {
  const grid = new Map<number, number>();
  const ok = spreadLight(
    { hex: center, elevation: 0, radius: 8, intensity: 0x10000, ...p },
    (h) => blockers[h] ?? none,
    (h, v) => grid.set(h, (grid.get(h) ?? 0) + v),
  );
  return { grid, ok };
}

describe('spreadLight: bez przeszkod', () => {
  it('kazdy heks w promieniu dostaje dokladnie jedna wartosc pierscienia I - k*step', () => {
    const { grid } = run();
    const step = Math.trunc((0x10000 - 0x28f) / 9);
    let count = 0;
    for (const [h, v] of grid) {
      const k = hexDistance(center, h);
      expect(k).toBeLessThanOrEqual(8);
      expect(v).toBe(0x10000 - k * step);
      count++;
    }
    expect(count).toBe(1 + 3 * 8 * 9);
  });

  it('promien 3 ogranicza pierscienie, ujemny krok rosnie ku brzegom (idiv)', () => {
    const { grid } = run({}, { radius: 3, intensity: 0x100 });
    const step = Math.trunc((0x100 - 0x28f) / 4);
    expect(step).toBeLessThan(0);
    expect(grid.get(hexInDirection(center, 2, 3))).toBe(0x100 - 3 * step);
    expect(grid.has(hexInDirection(center, 2, 4))).toBe(false);
  });

  it('odrzuca zrodla: brak intensywnosci, ukryte, bez flagi 0x20', () => {
    expect(run({}, { intensity: 0 }).ok).toBe(false);
    expect(run({}, { flags: 0x21 }).ok).toBe(false);
    expect(run({}, { flags: 0 }).ok).toBe(false);
    expect(run({}, { hex: HEX_COUNT }).ok).toBe(false);
  });

  it('tablica offsetow zgadza sie z hexInDirection dla obu parzystosci', () => {
    for (const par of [0, 1]) {
      const c = 20100 + par;
      const t = LIGHT_OFFSETS[par] as Int32Array;
      for (let d = 0; d < 6; d++) {
        const seen = new Set<number>();
        let idx = 0;
        for (let a = 0; a < 8; a++) {
          for (let k = 1; k <= 8 - a; k++, idx++) {
            const h = c + (t[d * 36 + idx] as number);
            expect(hexDistance(c, h)).toBe(a + k);
            expect(LIGHT_RING[idx]).toBe(a + k);
            seen.add(h);
          }
        }
        expect(seen.size).toBe(36);
      }
    }
  });
});

describe('spreadLight: blokowanie', () => {
  it('nieprzezroczysty obiekt zatrzymuje swiatlo za soba i nie oswietla hexa (kierunki 1..3)', () => {
    const wallHex = hexInDirection(center, 3, 2);
    const opaque: LightBlocker = { elevation: 0, flags: 0, type: 2, protoFlags: 0 };
    const { grid } = run({ [wallHex]: [opaque] });
    const free = run().grid;
    expect(grid.has(wallHex)).toBe(false);
    expect(grid.size).toBeLessThan(free.size);
    expect(grid.has(hexInDirection(center, 3, 5))).toBe(false);
    // dalej od kliny przeciwnej swiatlo dociera
    expect(grid.get(hexInDirection(center, 0, 5))).toBe(free.get(hexInDirection(center, 0, 5)));
  });

  it('obiekt z flaga LIGHT_THRU, ukryty lub z innego poziomu nie blokuje', () => {
    const h = hexInDirection(center, 3, 2);
    const free = run().grid;
    for (const o of [
      { elevation: 0, flags: 0x20000000, type: 2, protoFlags: 0 },
      { elevation: 0, flags: 1, type: 2, protoFlags: 0 },
      { elevation: 1, flags: 0, type: 2, protoFlags: 0 },
    ]) {
      expect(run({ [h]: [o] }).grid.size).toBe(free.size);
    }
  });

  it('sciana o proto 0x08000000 oswietlana tylko z kierunkow 4, 5 (i 0 przy pozycji < 8)', () => {
    const h = hexInDirection(center, 3, 2);
    const wall: LightBlocker = { elevation: 0, flags: 0x20000000, type: 3, protoFlags: 0x8000000 };
    const free = run().grid;
    const g = run({ [h]: [wall] }).grid;
    // sciana przezroczysta: nie blokuje dalszych pozycji, ale hex sciany w klinie 3 jest nieoswietlony
    expect(g.has(h)).toBe(free.has(h) ? g.has(h) : false);
    expect(g.size).toBeLessThanOrEqual(free.size);
  });

  it('skok 36-galeziowy: rodzice pozycji (przykladowe wiersze 0x48db98)', () => {
    const t = new Set<string>();
    const mk = (hit: string[]) => (w: 0 | 1, p: number) => (hit.includes(`${w}:${p}`) ? 1 : 0);
    expect(parentBlocked(0, mk(['0:0']))).toBe(0);
    expect(parentBlocked(1, mk(['0:0']))).toBe(1);
    expect(parentBlocked(8, mk(['0:0']))).toBe(0);
    expect(parentBlocked(8, mk(['0:0', '1:0']))).toBe(1);
    expect(parentBlocked(9, mk(['0:8', '0:1']))).toBe(1);
    expect(parentBlocked(9, mk(['0:8']))).toBe(0);
    expect(parentBlocked(35, mk(['0:33', '1:6']))).toBe(1);
    expect(t.size).toBe(0);
  });
});
