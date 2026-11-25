import { describe, expect, it } from 'vitest';
import { clientToWorld, terrainColor, worldToCanvas } from './worldmap-view';
import { WORLD_H, WORLD_W } from './worldmap-data';
import { drawWorldmap } from './worldmap-view';
import { WorldmapModel } from './worldmap-model';
import { wmData } from './worldmap-fixture';
import type { ArtImage, WorldmapArt } from './worldmap-art';

describe('worldmap-view', () => {
  const box = { width: 700, height: 750 };
  it('clientToWorld i worldToCanvas sa odwrotne, z przycinaniem do swiata', () => {
    expect(clientToWorld(350, 375, box)).toEqual({ x: WORLD_W / 2, y: WORLD_H / 2 });
    expect(clientToWorld(-10, 9999, box)).toEqual({ x: 0, y: WORLD_H - 1 });
    expect(worldToCanvas(WORLD_W / 2, WORLD_H / 2, box)).toEqual({ x: 350, y: 375 });
  });
  it('kolor terenu: znane i nieznane typy', () => {
    expect(terrainColor('Ocean')).not.toBe(terrainColor('Desert'));
    expect(terrainColor('???')).toBe(terrainColor('Desert'));
  });
  it('z grafika FRM: podkafle z WRLDMP przez drawImage, miasto i gracz ze sprite, bez kolorow terenu', () => {
    const img = (w: number, h: number): ArtImage => ({
      width: w,
      height: h,
      source: {} as CanvasImageSource,
    });
    const tiles = Array.from({ length: 20 }, () => img(350, 300));
    const art: WorldmapArt = {
      tiles,
      city: { Small: img(12, 12), Medium: img(25, 25), Large: img(49, 49) },
      target: img(11, 11),
      loc: img(5, 5),
      car: [],
    };
    const m = new WorldmapModel(wmData, { x: 100, y: 100 });
    m.reveal();
    const calls: unknown[][] = [];
    const fills: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, k) => {
          if (k === 'drawImage') return (...a: unknown[]) => void calls.push(a);
          if (k === 'fillRect') return () => fills.push('rect');
          return () => undefined;
        },
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    drawWorldmap(ctx, m, { width: 1400, height: 1500 }, art);
    const revealed = [...m.fog].filter((v) => v === 1).length;
    expect(revealed).toBeGreaterThan(0);
    // podkafle + sprite miasta (Arroyo widoczne) + sprite gracza
    expect(calls.length).toBe(revealed + 2);
    expect(calls[0]).toHaveLength(9);
    expect(fills).toEqual(['rect']); // tylko tlo
  });
});

import { drawWorldmapScreen, panelAreas } from './worldmap-view';

describe('drawWorldmapScreen', () => {
  const mk = () => {
    const calls: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get:
          (_t, k) =>
          (...a: unknown[]) =>
            void calls.push(`${String(k)}:${a.length}`),
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
  };
  const img = (w: number, h: number): ArtImage => ({
    width: w,
    height: h,
    source: {} as CanvasImageSource,
  });
  it('bez grafik: ramka i etykiety tekstowe, bez wyjatku; clip do okna widoku', () => {
    const m = new WorldmapModel(wmData, { x: 100, y: 100 });
    m.reveal();
    const { ctx, calls } = mk();
    drawWorldmapScreen(ctx, m, { x: 0, y: 0 }, null, { hhmm: 1200, encounterBlink: 1 });
    expect(calls).toContain('clip:0');
    expect(calls).toContain('fillText:3');
    expect(panelAreas(m).length).toBeGreaterThan(0);
  });
  it('z grafika: ramka, tarcza, glob, etykieta i ikona spotkania przez drawImage', () => {
    const m = new WorldmapModel(wmData, { x: 100, y: 100 });
    m.reveal();
    const art: WorldmapArt = {
      tiles: [],
      city: { Small: null, Medium: null, Large: null },
      target: null,
      loc: null,
      car: [],
      frame: img(640, 480),
      dial: [img(58, 29)],
      globe: img(134, 89),
      labels: new Map([[0, img(82, 18)]]),
      encounter: { rnd: [img(17, 17), img(17, 17)], fgt: [img(7, 11)] },
    };
    const { ctx, calls } = mk();
    drawWorldmapScreen(ctx, m, { x: 0, y: 0 }, art, { encounterBlink: 0, fight: true });
    const di = calls.filter(
      (c) => c === 'drawImage:3' || c === 'drawImage:5' || c.startsWith('drawImage'),
    );
    expect(di.length).toBeGreaterThanOrEqual(5);
  });
  it('tryb miasta: obraz TWN w oknie i znaczniki wejsc', () => {
    const m = new WorldmapModel(wmData, { x: 100, y: 100 });
    const { ctx, calls } = mk();
    drawWorldmapScreen(ctx, m, { x: 0, y: 0 }, null, {
      town: { image: img(450, 450), entrances: [{ x: 10, y: 10 }], title: 'X' },
    });
    expect(calls).toContain('drawImage:3');
    expect(calls).toContain('arc:5');
  });
  it('panel samochodu zamiast globu: WMCARMVE, WMSCREEN i 70 wierszy miernika', () => {
    const m = new WorldmapModel(wmData, { x: 100, y: 100 });
    const art: WorldmapArt = {
      tiles: [],
      city: { Small: null, Medium: null, Large: null },
      target: null,
      loc: null,
      car: [img(93, 73), img(93, 73)],
      screen: img(117, 95),
      globe: img(134, 89),
    };
    const drawn: unknown[][] = [];
    let rects = 0;
    const ctx = new Proxy(
      {},
      {
        get:
          (_t, k) =>
          (...a: unknown[]) => {
            if (k === 'drawImage') drawn.push(a);
            if (k === 'fillRect' && a[2] === 1 && a[3] === 1) rects++;
          },
        set: () => true,
      },
    ) as unknown as CanvasRenderingContext2D;
    drawWorldmapScreen(ctx, m, { x: 0, y: 0 }, art, { car: { frame: 1, gauge: 35 } });
    expect(drawn.some((a) => a[1] === 514 && a[2] === 336)).toBe(true);
    expect(drawn.some((a) => a[1] === 499 && a[2] === 330)).toBe(true);
    expect(drawn.some((a) => a[1] === 495 && a[2] === 330)).toBe(false);
    expect(rects).toBe(70);
  });
});
