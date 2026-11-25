/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { GPU_SKIP, bundleDevice, launch, newPage } from './harness.js';

/** Sciezka HD RGBA na prawdziwym WebGL2 (chromium + swiftshader). */
declare const F2R: {
  createWebGl2Device(c: HTMLCanvasElement): any;
  SpriteBatch: new () => any;
  Camera2D: new () => any;
};

let browser: Browser;
let page: Page;

const PAL = (() => {
  const p = new Uint8Array(1024);
  p.set([200, 150, 100, 255], 4); // idx 1
  return p;
})();

const SETUP = `
window.mk = (w, h) => {
  const dev = F2R.createWebGl2Device(document.getElementById('c'));
  dev.resize(w, h, 1);
  return dev;
};
window.rd = (dev) => Array.from(dev.readPixels());
`;

beforeAll(async () => {
  if (GPU_SKIP) return;
  browser = await launch();
  page = await newPage(browser, await bundleDevice());
  await page.addScriptTag({ content: SETUP });
}, 120_000);
afterAll(async () => {
  await browser?.close();
});

/** Piksel (x,y od gory) z readPixels (od dolu). */
function px(a: number[], w: number, h: number, x: number, y: number): number[] {
  const i = ((h - 1 - y) * w + x) * 4;
  return a.slice(i, i + 4);
}

describe.skipIf(GPU_SKIP)('device WebGL2: sciezka HD RGBA', () => {
  it('flaga off: batch tylko indeksowy daje identyczny obraz w trybie ordered i bez (i bez programu RGBA)', async () => {
    const res = await page.evaluate((pal) => {
      const w = window as any;
      const run = (ordered: boolean) => {
        const dev = w.mk(64, 64);
        dev.setPalette(new Uint8Array(pal));
        const t = dev.createIndexedTexture(16, 16, new Uint8Array(256).fill(1));
        const cam = new F2R.Camera2D();
        cam.x = 32;
        cam.y = 32;
        const b = new F2R.SpriteBatch();
        b.ordered = ordered;
        b.pushRect(t, 0, 0, 16, 16, 4, 4, 16, 16, 0.5);
        b.pushRect(t, 0, 0, 16, 16, 20, 20, 16, 16, 1);
        dev.beginFrame([0, 0, 0, 1]);
        dev.drawSprites(b, cam);
        dev.endFrame();
        return w.rd(dev);
      };
      return [run(false), run(true)];
    }, Array.from(PAL));
    expect(res[1]).toEqual(res[0]);
    expect(res[0]!.some((v) => v !== 0)).toBe(true);
  });

  it('RGBA: polprzezroczysty piksel miesza sie z tlem, przezroczysty pokazuje tlo, bez obwodki', async () => {
    const res = await page.evaluate(() => {
      const w = window as any;
      const dev = w.mk(32, 32);
      const d = new Uint8Array(4 * 4 * 4);
      // lewa polowa: bialy, alfa 128 (nieprzemnozony); prawa: przezroczysty z jaskrawym RGB
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          const o = (y * 4 + x) * 4;
          if (x < 2) d.set([255, 255, 255, 128], o);
          else d.set([255, 0, 0, 0], o);
        }
      const t = dev.createRgbaTexture(4, 4, d, { filter: 'nearest' });
      const cam = new F2R.Camera2D();
      cam.x = 16;
      cam.y = 16;
      const b = new F2R.SpriteBatch();
      b.ordered = true;
      b.pushRect(t, 0, 0, 4, 4, 8, 8, 16, 16, 1);
      dev.beginFrame([0, 0, 1, 1]);
      dev.drawSprites(b, cam);
      dev.endFrame();
      return w.rd(dev);
    });
    const half = px(res, 32, 32, 10, 16);
    expect(half[0]).toBeGreaterThan(110);
    expect(half[0]).toBeLessThan(145);
    expect(half[2]).toBeGreaterThan(240); // tlo niebieskie przebija
    const clear = px(res, 32, 32, 20, 16);
    expect(clear).toEqual([0, 0, 255, 255]); // brak czerwonej obwodki
  });

  it('kolejnosc rysowania: indeks, RGBA, indeks (ordered) - ostatni wygrywa', async () => {
    const res = await page.evaluate((pal) => {
      const w = window as any;
      const dev = w.mk(32, 32);
      dev.setPalette(new Uint8Array(pal));
      const idx = dev.createIndexedTexture(8, 8, new Uint8Array(64).fill(1));
      const rgba = dev.createRgbaTexture(
        2,
        2,
        new Uint8Array(16).fill(255).map((v, i) => (i % 4 === 0 ? 0 : v)),
        {
          filter: 'linear',
        },
      ); // cyjan, nieprzezroczysty
      const cam = new F2R.Camera2D();
      cam.x = 16;
      cam.y = 16;
      const b = new F2R.SpriteBatch();
      b.ordered = true;
      b.pushRect(idx, 0, 0, 8, 8, 4, 4, 16, 16, 1);
      b.pushRect(rgba, 0, 0, 2, 2, 8, 8, 16, 16, 1);
      b.pushRect(idx, 0, 0, 8, 8, 12, 12, 8, 8, 1);
      dev.beginFrame([0, 0, 0, 1]);
      dev.drawSprites(b, cam);
      dev.endFrame();
      return w.rd(dev);
    }, Array.from(PAL));
    expect(px(res, 32, 32, 6, 6)).toEqual([200, 150, 100, 255]); // tylko indeks #1
    expect(px(res, 32, 32, 10, 10)).toEqual([0, 255, 255, 255]); // RGBA nad indeksem
    expect(px(res, 32, 32, 14, 14)).toEqual([200, 150, 100, 255]); // indeks #2 nad RGBA
  });

  it('oswietlenie: sprite RGBA jest modulowany swiatlem otoczenia (litAmbient)', async () => {
    const res = await page.evaluate(() => {
      const w = window as any;
      const dev = w.mk(32, 32);
      const t = dev.createRgbaTexture(2, 2, new Uint8Array(16).fill(255), { filter: 'nearest' });
      const cam = new F2R.Camera2D();
      cam.x = 16;
      cam.y = 16;
      const draw = (light: number) => {
        const b = new F2R.SpriteBatch();
        b.ordered = true;
        b.pushRect(t, 0, 0, 2, 2, 8, 8, 16, 16, light);
        dev.beginFrame([0, 0, 0, 1]);
        dev.drawSprites(b, cam);
        dev.endFrame();
        return w.rd(dev);
      };
      return [draw(1), draw(0.5)];
    });
    expect(px(res[0]!, 32, 32, 16, 16)).toEqual([255, 255, 255, 255]);
    const dim = px(res[1]!, 32, 32, 16, 16);
    expect(dim[0]).toBeGreaterThan(120);
    expect(dim[0]).toBeLessThan(136);
  });
});
