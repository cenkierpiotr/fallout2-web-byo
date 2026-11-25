import { describe, expect, it } from 'vitest';
import { hexToWorld } from '@f2/engine-core';
import { IsoCamera } from '../iso-camera.js';
import { LightMap } from '../light-map.js';
import { ObjectLayer, type ObjectFrame } from '../object-layer.js';
import { SpriteBatch } from '../sprite-batch.js';
import { mapWith, obj } from './helpers.js';

const tex = { id: 1, width: 64, height: 64 };
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

describe('ObjectLayer', () => {
  it('rysuje flat przed nie-flat, pomija ukryte i inne poziomy, ustawia pozycje', () => {
    const flat = obj({ id: 1, hex: 20100, flags: 0x8 });
    const stand = obj({ id: 2, hex: 20100 });
    const hidden = obj({ id: 3, hex: 20100, flags: 1 });
    const other = obj({ id: 4, hex: 20100, elevation: 1 });
    const batch = new SpriteBatch();
    const layer = new ObjectLayer({ frameFor: () => frame }, batch);
    const cam = new IsoCamera();
    const p = hexToWorld(20100);
    cam.x = p.x;
    cam.y = p.y;
    const lm = new LightMap();
    layer.draw(mapWith([stand, hidden, other, flat]), 0, cam, lm, { player: stand });
    expect(batch.count).toBe(2);
    const g = batch.groups()[0]!;
    expect(g.vertices[0]).toBe(p.x - 10);
    expect(g.vertices[1]).toBe(p.y - 30);
  });

  it('odcina obiekty poza widokiem', () => {
    const batch = new SpriteBatch();
    const layer = new ObjectLayer({ frameFor: () => frame }, batch);
    const cam = new IsoCamera();
    layer.draw(mapWith([obj({ hex: 39999 })]), 0, cam, new LightMap(), { player: obj() });
    expect(batch.count).toBe(0);
  });
});
