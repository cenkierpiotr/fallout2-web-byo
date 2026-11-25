import { describe, expect, it } from 'vitest';
import { hexToWorld } from '@f2/engine-core';
import { IsoCamera } from '../iso-camera.js';
import { LightMap } from '../light-map.js';
import { ObjectLayer, type ObjectFrame } from '../object-layer.js';
import { SpriteBatch } from '../sprite-batch.js';
import { worldMetrics } from '../hd-override.js';
import { mapWith, obj } from './helpers.js';

const base: ObjectFrame = {
  texture: { id: 1, width: 512, height: 512 },
  sx: 0,
  sy: 0,
  width: 80,
  height: 36,
  offsetX: 4,
  offsetY: 8,
  shiftX: 0,
  shiftY: 0,
};
const hd: ObjectFrame = {
  ...base,
  texture: { id: 2, width: 4096, height: 4096 },
  width: 320,
  height: 144,
  offsetX: 16,
  offsetY: 32,
  scale: 4,
};

describe('HD w render', () => {
  it('test_render_hd_sprite_same_world_size', () => {
    expect(worldMetrics(hd)).toEqual(worldMetrics(base));
    const draw = (f: ObjectFrame) => {
      const batch = new SpriteBatch();
      const cam = new IsoCamera();
      const pp = hexToWorld(20100);
      cam.x = pp.x;
      cam.y = pp.y;
      const o = obj({ hex: 20100 });
      new ObjectLayer({ frameFor: () => f }, batch).draw(mapWith([o]), 0, cam, new LightMap(), {
        player: o,
      });
      return batch;
    };
    const g = draw(hd).groups()[0]!.vertices;
    const b = draw(base).groups()[0]!.vertices;
    // wierzcholki x,y identyczne (rozne tylko UV)
    for (const i of [0, 1, 4, 5, 8, 9, 12, 13]) expect(g[i]).toBeCloseTo(b[i]!);
    const p = hexToWorld(20100);
    expect(g[0]).toBeCloseTo(p.x + 4 - 40);
    expect(g[4]! - g[0]!).toBeCloseTo(80);
  });
});
