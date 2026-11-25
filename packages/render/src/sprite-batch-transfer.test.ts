import { describe, expect, it } from 'vitest';
import type { IndexedTexture } from './gfx-device.js';
import { SpriteBatch } from './sprite-batch.js';
import { FrameGate } from './worker/RenderProxy.js';

const tex = (id: number): IndexedTexture => ({ id, width: 64, height: 64 }) as IndexedTexture;

describe('SpriteBatch.toTransferable (renderWorker E3)', () => {
  it('round-trip: grupy po odtworzeniu = groups() oryginalu', () => {
    const b = new SpriteBatch();
    const a = tex(1);
    const c = tex(2);
    b.currentLayer = 0;
    b.pushRect(a, 0, 0, 8, 8, 10, 10, 8, 8, 0.5);
    b.currentLayer = 1;
    b.pushRect(c, 0, 0, 4, 4, 1, 2, 4, 4);
    b.pushRect(a, 8, 0, 8, 8, 20, 10, 8, 8);
    const t = b.toTransferable();
    const back = SpriteBatch.groupsFrom(t, (id) => (id === 1 ? a : c));
    const orig = b.groups();
    expect(back.length).toBe(orig.length);
    back.forEach((g, i) => {
      expect(g.texture.id).toBe(orig[i]!.texture.id);
      expect(g.spriteCount).toBe(orig[i]!.spriteCount);
      expect(g.area).toBe(orig[i]!.area);
      expect(Array.from(g.vertices)).toEqual(Array.from(orig[i]!.vertices));
      expect(Array.from(g.lights)).toEqual(Array.from(orig[i]!.lights));
      expect(Array.from(g.layers)).toEqual(Array.from(orig[i]!.layers));
    });
  });

  it('kopie sa skrocone do spriteCount i niezalezne od buforow batcha; transferList = 3 bufory na grupe', () => {
    const b = new SpriteBatch();
    b.pushRect(tex(1), 0, 0, 8, 8, 0, 0, 8, 8);
    const t = b.toTransferable();
    expect(t.groups[0]!.vertices.length).toBe(16);
    expect(SpriteBatch.transferList(t).length).toBe(3);
    b.clear();
    b.pushRect(tex(1), 0, 0, 8, 8, 50, 50, 8, 8);
    expect(t.groups[0]!.vertices[0]).toBe(0);
  });

  it('pusta klatka i tryb ordered', () => {
    const b = new SpriteBatch();
    expect(b.toTransferable().groups).toEqual([]);
    b.ordered = true;
    b.pushRect(tex(1), 0, 0, 8, 8, 0, 0, 8, 8);
    expect(b.toTransferable().ordered).toBe(true);
  });
});

describe('FrameGate (backpressure)', () => {
  it('1 klatka w locie: kolejna odrzucona dopoki brak potwierdzenia', () => {
    const g = new FrameGate();
    expect(g.tryAcquire()).toBe(true);
    expect(g.tryAcquire()).toBe(false);
    expect(g.dropped).toBe(1);
    g.release();
    expect(g.tryAcquire()).toBe(true);
    g.release();
    g.release();
    expect(g.tryAcquire()).toBe(true);
    expect(g.tryAcquire()).toBe(false);
  });
  it('maxInFlight 2 i reset', () => {
    const g = new FrameGate(2);
    expect(g.tryAcquire() && g.tryAcquire()).toBe(true);
    expect(g.tryAcquire()).toBe(false);
    g.reset();
    expect(g.tryAcquire()).toBe(true);
  });
});
