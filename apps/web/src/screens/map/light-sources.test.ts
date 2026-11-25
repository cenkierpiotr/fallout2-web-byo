import { describe, expect, it } from 'vitest';
import { hexToWorld, makeHex } from '@f2/engine-core';
import {
  LIGHT_PX_PER_HEX,
  LIGHT_Z,
  collectLightSources,
  pickVisibleLights,
  toPointLight,
  type EmitterLike,
} from './light-sources';

const em = (p: Partial<EmitterLike>): EmitterLike => ({
  hex: makeHex(100, 100),
  elevation: 0,
  flags: 0x20,
  lightRadius: 4,
  lightIntensity: 0x8000,
  ...p,
});

const noRadius = (): EmitterLike => {
  const e = em({});
  delete e.lightRadius;
  return e;
};

describe('collectLightSources', () => {
  it('bierze tylko obiekty z flaga 0x20, nieukryte, z promieniem i intensywnoscia', () => {
    const out = collectLightSources(
      [
        em({}),
        em({ flags: 0 }),
        em({ flags: 0x21 }),
        em({ hidden: true }),
        em({ lightRadius: 0 }),
        em({ lightIntensity: 0 }),
        noRadius(),
      ],
      0,
    );
    expect(out).toHaveLength(1);
  });
  it('filtruje pietro i heksy poza siatka', () => {
    expect(collectLightSources([em({ elevation: 1 })], 0)).toEqual([]);
    expect(collectLightSources([em({ hex: -1 }), em({ hex: 40000 })], 0)).toEqual([]);
  });
  it('obcina promien do 8 i intensywnosc do 0x10000', () => {
    const [s] = collectLightSources([em({ lightRadius: 20, lightIntensity: 0x50000 })], 0);
    expect(s).toMatchObject({ radius: 8, intensity: 0x10000 });
  });
});

describe('toPointLight', () => {
  it('hex -> piksele swiata, promien w px, intensywnosc 0..1, domyslnie bialy', () => {
    const hex = makeHex(100, 100);
    const l = toPointLight({ hex, elevation: 0, intensity: 0x8000, radius: 4 });
    const w = hexToWorld(hex);
    expect(l.x).toBe(w.x);
    expect(l.y).toBe(w.y);
    expect(l.z).toBeCloseTo(LIGHT_Z * l.radius);
    expect(l.radius).toBe(4 * LIGHT_PX_PER_HEX);
    expect(l.intensity).toBeCloseTo(0.5);
    expect(l.color).toEqual([1, 1, 1]);
  });
  it('kolor RGB 0..255 -> 0..1', () => {
    const l = toPointLight({
      hex: 0,
      elevation: 0,
      intensity: 65536,
      radius: 1,
      color: [255, 0, 51],
    });
    expect(l.color[1]).toBe(0);
    expect(l.color[2]).toBeCloseTo(0.2);
  });
});

describe('pickVisibleLights', () => {
  const near = collectLightSources([em({ hex: makeHex(100, 100) })], 0)[0]!;
  const far = collectLightSources([em({ hex: makeHex(10, 10) })], 0)[0]!;
  const c = hexToWorld(near.hex);
  it('pomija swiatla poza widokiem, zostawia te w zasiegu', () => {
    const out = pickVisibleLights([far, near], c.x, c.y, 320, 240);
    expect(out).toHaveLength(1);
    expect(out[0]!.x).toBe(c.x);
  });
  it('limit i kolejnosc wg odleglosci od srodka, remis: nizszy hex', () => {
    const a = collectLightSources([em({ hex: makeHex(100, 100) })], 0)[0]!;
    const b = collectLightSources([em({ hex: makeHex(101, 100) })], 0)[0]!;
    const w = hexToWorld(a.hex);
    const out = pickVisibleLights([b, a], w.x, w.y, 1000, 1000, 1);
    expect(out).toHaveLength(1);
    expect(out[0]!.x).toBe(w.x);
    expect(pickVisibleLights([a], w.x, w.y, 1000, 1000, 0)).toEqual([]);
  });
});
