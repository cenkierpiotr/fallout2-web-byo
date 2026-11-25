import { describe, expect, it } from 'vitest';
import { hexToWorld } from '@f2/engine-core';
import { compareDrawKeys, drawKey, sortForDraw } from '../draw-order.js';
import { obj } from './helpers.js';

const FLAT = 0x8;

describe('draw-order', () => {
  it('compareDrawKeys: flat przed nie-flat w tym samym heksie', () => {
    const a = drawKey(obj({ flags: FLAT }), 1);
    const b = drawKey(obj({ flags: 0 }), 0);
    expect(compareDrawKeys(a, b)).toBeLessThan(0);
    expect(compareDrawKeys(b, a)).toBeGreaterThan(0);
  });

  it('flat z dalszego heksa nadal przed nie-flat z wczesniejszego (faza flat)', () => {
    const late = drawKey(obj({ hex: 30000, flags: FLAT }), 0);
    const early = drawKey(obj({ hex: 100, flags: 0 }), 0);
    expect(compareDrawKeys(late, early)).toBeLessThan(0);
  });

  it('poziom ma pierwszenstwo nad flat', () => {
    const e0 = drawKey(obj({ elevation: 0 }), 0);
    const e1 = drawKey(obj({ elevation: 1, flags: FLAT }), 0);
    expect(compareDrawKeys(e0, e1)).toBeLessThan(0);
  });

  it('kolejnosc komorek: skan ekranu (y, potem x srodka heksa), 10 par', () => {
    const hexes = [0, 199, 200, 399, 4000, 4100, 19999, 20000, 20101, 39999];
    for (let i = 0; i + 1 < hexes.length; i++) {
      const ha = hexes[i] as number;
      const hb = hexes[i + 1] as number;
      const pa = hexToWorld(ha);
      const pb = hexToWorld(hb);
      const expected = pa.y !== pb.y ? Math.sign(pa.y - pb.y) : Math.sign(pa.x - pb.x);
      const got = Math.sign(
        compareDrawKeys(drawKey(obj({ hex: ha }), 0), drawKey(obj({ hex: hb }), 0)),
      );
      expect(got).toBe(expected);
    }
  });

  it('w heksie: klucz (y, x) przesuniecia klatki, potem kolejnosc listy', () => {
    const a = obj({ id: 1 });
    const b = obj({ id: 2 });
    const c = obj({ id: 3 });
    const shifts: Record<number, { x: number; y: number }> = {
      1: { x: 0, y: 5 },
      2: { x: 3, y: 0 },
      3: { x: 1, y: 0 },
    };
    expect(sortForDraw([a, b, c], (o) => shifts[o.id]).map((o) => o.id)).toEqual([3, 2, 1]);
  });

  it('sortForDraw jest stabilny dla rownych kluczy', () => {
    const list = Array.from({ length: 50 }, (_, i) => obj({ id: i, hex: 100 + (i % 3) }));
    const sorted = sortForDraw(list);
    for (const h of [100, 101, 102]) {
      const ids = sorted.filter((o) => o.hex === h).map((o) => o.id);
      expect(ids).toEqual([...ids].sort((x, y) => x - y));
    }
  });

  it('obiekty bez heksa ida na koniec poziomu', () => {
    const none = obj({ id: 9, hex: -1 });
    const some = obj({ id: 8, hex: 39999 });
    expect(sortForDraw([none, some]).map((o) => o.id)).toEqual([8, 9]);
  });
});
