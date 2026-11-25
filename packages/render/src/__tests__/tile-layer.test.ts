import { describe, expect, it } from 'vitest';
import { tileIndexToWorld } from '@f2/engine-core';
import { IsoCamera } from '../iso-camera.js';
import { SpriteBatch, type SpriteInstance } from '../sprite-batch.js';
import { TileLayer, type TileFrame } from '../tile-layer.js';

const tex = { id: 1, width: 128, height: 128 };
const frame: TileFrame = { texture: tex, sx: 0, sy: 0, width: 80, height: 36 };

function collect(batch: SpriteBatch): SpriteInstance[] {
  const out: SpriteInstance[] = [];
  for (const g of batch.groups()) {
    for (let o = 0; o < g.vertices.length; o += 16) {
      out.push({
        texture: g.texture,
        sx: 0,
        sy: 0,
        sw: 80,
        sh: 36,
        x: g.vertices[o] as number,
        y: g.vertices[o + 1] as number,
      });
    }
  }
  return out;
}

function tiles(floor: number, roof: number) {
  return { floor: new Uint16Array(10000).fill(floor), roof: new Uint16Array(10000).fill(roof) };
}

describe('TileLayer', () => {
  it('drawFloor tnie do widoku', () => {
    const batch = new SpriteBatch();
    const layer = new TileLayer(batch);
    layer.setTiles(tiles(5, 1), (i) => (i === 1 ? undefined : frame));
    const cam = new IsoCamera();
    cam.viewportW = 640;
    cam.viewportH = 380;
    cam.x = 2000;
    cam.y = 1000;
    layer.drawFloor(cam);
    expect(batch.count).toBeGreaterThan(0);
    expect(batch.count).toBeLessThan(10000);
    const r = cam.visibleWorldRect();
    for (const s of collect(batch)) {
      expect(s.x + 80).toBeGreaterThanOrEqual(r.x0 - 80);
      expect(s.x).toBeLessThanOrEqual(r.x1 + 80);
      expect(s.y + 36).toBeGreaterThanOrEqual(r.y0 - 36);
      expect(s.y).toBeLessThanOrEqual(r.y1 + 36);
    }
  });

  it('kafel 0 rysowany w tileIndexToWorld(0)', () => {
    const batch = new SpriteBatch();
    const layer = new TileLayer(batch);
    layer.setTiles(tiles(5, 1), () => frame);
    const p = tileIndexToWorld(0);
    const cam = new IsoCamera();
    cam.x = p.x + 40;
    cam.y = p.y + 18;
    layer.drawFloor(cam);
    expect(collect(batch).some((s) => s.x === p.x && s.y === p.y)).toBe(true);
  });

  it('dach: 96 px wyzej, alpha 0 i brak ramki pomijane', () => {
    const batch = new SpriteBatch();
    const layer = new TileLayer(batch);
    const t = tiles(5, 7);
    layer.setTiles(t, () => frame);
    const p = tileIndexToWorld(0);
    const cam = new IsoCamera();
    cam.x = p.x + 40;
    cam.y = p.y - 96 + 18;
    layer.drawRoof(cam, () => 1);
    expect(collect(batch).some((s) => s.x === p.x && s.y === p.y - 96)).toBe(true);
    batch.clear();
    layer.drawRoof(cam, () => 0);
    expect(batch.count).toBe(0);
    layer.setTiles(t, () => undefined);
    layer.drawRoof(cam, () => 1);
    expect(batch.count).toBe(0);
  });
  it('pasma: kazdy kafel to kilka ciasnych quadow z przesunietymi UV i mniejszym polem', () => {
    const batch = new SpriteBatch();
    const layer = new TileLayer(batch);
    const banded: TileFrame = {
      ...frame,
      bands: [
        { x0: 30, y0: 0, x1: 50, y1: 9 },
        { x0: 0, y0: 9, x1: 80, y1: 27 },
        { x0: 30, y0: 27, x1: 50, y1: 36 },
      ],
    };
    layer.setTiles(tiles(5, 1), () => banded);
    const p = tileIndexToWorld(0);
    const cam = new IsoCamera();
    cam.x = p.x + 40;
    cam.y = p.y + 18;
    layer.drawFloor(cam);
    const full = new SpriteBatch();
    const layer2 = new TileLayer(full);
    layer2.setTiles(tiles(5, 1), () => frame);
    layer2.drawFloor(cam);
    expect(batch.count).toBe(full.count * 3);
    const area = (b: SpriteBatch) => b.groups().reduce((a, g) => a + g.area, 0);
    expect(area(batch)).toBeLessThan(area(full) * 0.7);
    const g = batch.groups()[0]!;
    // pierwszy kafel (po sortowaniu wg indeksow, kafel 0 jest pierwszy w widoku): quad srodkowego pasma
    const hit = [];
    for (let o = 0; o < g.vertices.length; o += 16) {
      if (g.vertices[o] === p.x && g.vertices[o + 1] === p.y + 9) hit.push(o);
    }
    expect(hit.length).toBe(1);
    const o = hit[0]!;
    expect(g.vertices[o + 2]).toBeCloseTo(0 / 128);
    expect(g.vertices[o + 3]).toBeCloseTo(9 / 128);
    expect(g.vertices[o + 4]).toBe(p.x + 80);
    expect(g.vertices[o + 15]).toBeCloseTo(27 / 128);
  });
});
