import { describe, expect, it } from 'vitest';
import { hexToWorld, makeHex } from '@f2/engine-core';
import { IsoCamera } from '../iso-camera.js';
import { LightMap } from '../light-map.js';
import { ObjectLayer, type ObjectFrame } from '../object-layer.js';
import { SpriteBatch } from '../sprite-batch.js';
import { TileLayer, type TileFrame } from '../tile-layer.js';
import { AMBIENT_FLOOR, ambientFromScriptLevel, isOutdoorMap, resolveAmbient } from '../ambient.js';
import { mapWith, obj } from './helpers.js';

const tex = { id: 1, width: 128, height: 128 };

describe('SpriteBatch: swiatlo na wierzcholek', () => {
  it('domyslnie 1, pushRect i push niosa swiatlo, bufory rosna razem', () => {
    const b = new SpriteBatch();
    b.pushRect(tex, 0, 0, 8, 8, 0, 0, 8, 8);
    b.pushRect(tex, 0, 0, 8, 8, 0, 0, 8, 8, 0.4);
    b.push({ texture: tex, sx: 0, sy: 0, sw: 8, sh: 8, x: 0, y: 0, light: 0.25 });
    const g = b.groups()[0]!;
    expect(Array.from(g.lights)).toEqual(
      [1, 1, 1, 1, 0.4, 0.4, 0.4, 0.4, 0.25, 0.25, 0.25, 0.25].map(Math.fround),
    );
    for (let i = 0; i < 600; i++) b.pushRect(tex, 0, 0, 1, 1, 0, 0, 1, 1, 0.5);
    const g2 = b.groups()[0]!;
    expect(g2.lights.length).toBe(g2.spriteCount * 4);
    expect(g2.lights[0]).toBe(1);
    expect(g2.lights[g2.lights.length - 1]).toBe(0.5);
  });
});

describe('LightMap: otoczenie i kafle', () => {
  it('setAmbient przelicza podloge bez zrodel', () => {
    const lm = new LightMap();
    lm.rebuildStatic(mapWith([]), 0, 1);
    expect(lm.intensityAt(20100)).toBe(1);
    lm.setAmbient(0.25);
    expect(lm.intensityAt(20100)).toBe(0.25);
    expect(lm.ambientLevel).toBe(0.25);
  });
  it('zrodlo zostaje po zmianie otoczenia (noc = swiatlo lampy)', () => {
    const lm = new LightMap();
    const lamp = obj({ hex: 20100, flags: 0x20, lightRadius: 4, lightIntensity: 0x10000 });
    lm.rebuildStatic(mapWith([lamp]), 0, 1);
    lm.setAmbient(0.25);
    expect(lm.intensityAt(20100)).toBe(1);
    expect(lm.intensityAt(makeHex(1, 1))).toBe(0.25);
  });
  it('intensityAtTile czyta heks (2tx+1, 2ty), poza zakresem 0', () => {
    const lm = new LightMap();
    lm.rebuildStatic(mapWith([]), 0, 0.5);
    expect(lm.intensityAtTile(0)).toBe(0.5);
    expect(lm.intensityAtTile(9999)).toBe(0.5);
    expect(lm.intensityAtTile(-1)).toBe(0);
    expect(lm.intensityAtTile(10000)).toBe(0);
    const lamp = obj({
      hex: makeHex(51, 50),
      flags: 0x20,
      lightRadius: 1,
      lightIntensity: 0x10000,
    });
    lm.rebuildStatic(mapWith([lamp]), 0, 0.25);
    expect(lm.intensityAtTile(25 * 100 + 25)).toBe(1);
  });
});

describe('warstwy niosa swiatlo do batcha', () => {
  const cam = () => {
    const c = new IsoCamera();
    c.viewportW = 640;
    c.viewportH = 380;
    return c;
  };
  it('ObjectLayer: swiatlo heksa obiektu', () => {
    const frame: ObjectFrame = {
      texture: tex,
      sx: 0,
      sy: 0,
      width: 20,
      height: 30,
      offsetX: 0,
      offsetY: 0,
      shiftX: 0,
      shiftY: 0,
    };
    const batch = new SpriteBatch();
    const layer = new ObjectLayer({ frameFor: () => frame }, batch);
    const lm = new LightMap();
    lm.rebuildStatic(mapWith([]), 0, 0.3);
    const o = obj({ hex: 20100 });
    const c = cam();
    const p = hexToWorld(20100);
    c.x = p.x;
    c.y = p.y;
    layer.draw(mapWith([o]), 0, c, lm, { player: o });
    expect(batch.groups()[0]!.lights[0]).toBeCloseTo(0.3, 5);
  });
  it('TileLayer: lightAt(tileIndex) lub 1 bez niego', () => {
    const f: TileFrame = { texture: tex, sx: 0, sy: 0, width: 80, height: 36 };
    const t = { floor: new Uint16Array(10000).fill(5), roof: new Uint16Array(10000).fill(1) };
    const mk = (lightAt?: (i: number) => number) => {
      const b = new SpriteBatch();
      const l = new TileLayer(b);
      l.setTiles(t, (i) => (i === 1 ? undefined : f));
      const c = cam();
      c.x = 2000;
      c.y = 1500;
      l.drawFloor(c, lightAt);
      return b.groups()[0]!;
    };
    expect(new Set(mk().lights)).toEqual(new Set([1]));
    const lit = mk((i) => (i % 2 ? 0.5 : 0.75));
    expect(new Set(lit.lights)).toEqual(new Set([0.5, 0.75]));
  });
});

describe('ambient', () => {
  it('poziom ze skryptu: obciecie 0x4000..0x10000', () => {
    expect(ambientFromScriptLevel(0x10000)).toBe(1);
    expect(ambientFromScriptLevel(0)).toBe(AMBIENT_FLOOR);
    expect(ambientFromScriptLevel(0x8000)).toBe(0.5);
    expect(ambientFromScriptLevel(1e9)).toBe(1);
  });
  it('isOutdoorMap wg udzialu dachow', () => {
    const open = new Uint16Array(100).fill(1);
    const indoor = new Uint16Array(100).fill(12);
    expect(isOutdoorMap(open)).toBe(true);
    expect(isOutdoorMap(indoor)).toBe(false);
    expect(isOutdoorMap(new Uint16Array(0))).toBe(false);
  });
  it('resolveAmbient: skrypt > zegar (tylko zewnatrz) > pelne', () => {
    expect(resolveAmbient(0.6, 0.25, false)).toBe(0.6);
    expect(resolveAmbient(undefined, 0.3, true)).toBe(0.3);
    expect(resolveAmbient(undefined, 0.3, false)).toBe(1);
    expect(resolveAmbient(0.01, 1, true)).toBe(AMBIENT_FLOOR);
  });
});
