import { describe, expect, it } from 'vitest';
import { TileLayer } from './tile-layer.js';
import { SpriteBatch } from './sprite-batch.js';
import type { IsoCamera } from './iso-camera.js';

const cam = { visibleWorldRect: () => ({ x0: -1e6, y0: -1e6, x1: 1e6, y1: 1e6 }) } as IsoCamera;

function widths(frame: { width: number; height: number; scale?: number }): number[] {
  const batch = new SpriteBatch();
  const layer = new TileLayer(batch);
  const floor = new Array<number>(10000).fill(0);
  floor[0] = 5;
  layer.setTiles({ floor, roof: new Array(10000).fill(0) }, (i) =>
    i === 5 ? { texture: { id: 1, width: 4096, height: 4096 }, sx: 0, sy: 0, ...frame } : undefined,
  );
  layer.drawFloor(cam);
  const v = batch.groups()[0]!.vertices;
  return [v[4]! - v[0]!, v[13]! - v[1]!];
}

describe('TileLayer: kafel HD (scale)', () => {
  it('bez scale: rozmiar w swiecie = rozmiar tekstury (bez zmian)', () => {
    expect(widths({ width: 80, height: 36 })).toEqual([80, 36]);
  });
  it('scale 4: kafel 320x144 zajmuje 80x36 jednostek swiata', () => {
    expect(widths({ width: 320, height: 144, scale: 4 })).toEqual([80, 36]);
  });
});
