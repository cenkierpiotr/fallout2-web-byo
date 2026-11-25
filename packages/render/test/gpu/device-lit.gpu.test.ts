import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { hexToWorld } from '@f2/engine-core';
import { shadePixel } from '../../src/lighting/light-pass.js';
import { packLights } from '../../src/lighting/light-pass.js';
import type { PointLight } from '../../src/lighting/types.js';
import { GPU_SKIP, bundleDevice, launch, newPage } from './harness.js';

/** Klasyczny render i sciezka oswietlenia 2.5D na prawdziwym WebGL2 (chromium + swiftshader). */
declare const F2R: {
  createWebGl2Device(c: HTMLCanvasElement): any;
  SpriteBatch: new () => any;
  Camera2D: new () => any;
};

let browser: Browser;
let page: Page;

const W = 64;
const PAL = (() => {
  const p = new Uint8Array(1024);
  p.set([200, 150, 100, 255], 4); // idx 1
  p.set([40, 220, 90, 255], 8); // idx 2
  return p;
})();

/** Wspolny setup w stronie: urzadzenie 64x64, tekstura indeksowa 64x64 (idx 1 wszedzie, idx 0 w prawej dolnej cwiartce). */
const SETUP = `
window.mk = (w, h) => {
  const canvas = document.getElementById('c');
  const dev = F2R.createWebGl2Device(canvas);
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

function texData(): number[] {
  const d = new Array<number>(W * W).fill(1);
  for (let y = 32; y < 64; y++) for (let x = 32; x < 64; x++) d[y * W + x] = 0;
  return d;
}

/** Flip wierszy readPixels (od dolu) na kolejnosc od gory. */
function flip(px: number[], w: number, h: number): number[] {
  const out = new Array<number>(px.length);
  for (let y = 0; y < h; y++)
    for (let i = 0; i < w * 4; i++) out[y * w * 4 + i] = px[(h - 1 - y) * w * 4 + i]!;
  return out;
}

describe.skipIf(GPU_SKIP)('device WebGL2: klasyczny render i flaga oswietlenia', () => {
  it('flaga wylaczona (brak setLighting / enabled:false) = ten sam obraz, zgodny z CPU (paleta * light)', async () => {
    const res = await page.evaluate(
      ([pal, tex]) => {
        const w = window as any;
        const dev = w.mk(64, 64);
        dev.setPalette(new Uint8Array(pal));
        const t = dev.createIndexedTexture(64, 64, new Uint8Array(tex));
        const cam = new F2R.Camera2D();
        cam.x = 32;
        cam.y = 32;
        const draw = () => {
          const b = new F2R.SpriteBatch();
          b.pushRect(t, 0, 0, 32, 32, 8, 8, 32, 32, 0.5);
          b.pushRect(t, 0, 0, 16, 16, 40, 4, 16, 16, 1);
          dev.beginFrame([0, 0, 0, 1]);
          dev.drawSprites(b, cam);
          dev.endFrame();
          return w.rd(dev);
        };
        const classic = draw();
        dev.setLighting({
          enabled: false,
          ambient: [1, 1, 1],
          sunDir: [0, 0, 1],
          normalStrength: 0.6,
          lightCount: 3,
          lightsUbo: new Float32Array(128),
          cameraDelta: [50, 50],
          parallaxFactor: 0.5,
          time: 0,
        });
        const disabled = draw();
        dev.setLighting(null);
        const nulled = draw();
        const err = (dev as any).readPixels && 0;
        return { classic, disabled, nulled, err };
      },
      [Array.from(PAL), texData()] as const,
    );
    expect(res.disabled).toEqual(res.classic);
    expect(res.nulled).toEqual(res.classic);
    const px = flip(res.classic, 64, 64);
    const at = (x: number, y: number) => px.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 3);
    expect(at(20, 20)).toEqual([100, 75, 50]); // 200,150,100 * 0.5
    expect(at(45, 8)).toEqual([200, 150, 100]);
    expect(at(2, 2)).toEqual([0, 0, 0]);
  });

  it('lit: zgodnosc z shadePixel (normal map, 2 swiatla, ambient) w +-3/255', async () => {
    const lights: PointLight[] = [
      { x: 20, y: 30, z: 10, color: [1, 0.8, 0.6], radius: 45, intensity: 1.2 },
      { x: 50, y: 12, z: 6, color: [0.4, 0.6, 1], radius: 30, intensity: 0.8 },
    ];
    const ambient: [number, number, number] = [0.3, 0.35, 0.4];
    const ubo = Array.from(packLights(lights).data);
    // normal map: lewa polowa przechylona w prawo, prawa w lewo (RGBA8)
    const normal: number[] = [];
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        const n = x < 32 ? [0.6, 0, 0.8] : [-0.3, 0.5, 0.81];
        normal.push(...n.map((c) => Math.round((c * 0.5 + 0.5) * 255)), 255);
      }
    for (const strength of [0, 0.6, 1]) {
      const got = await page.evaluate(
        ([pal, tex, nrm, u, amb, s]) => {
          const w = window as any;
          const dev = w.mk(64, 64);
          dev.setPalette(new Uint8Array(pal));
          const t = dev.createIndexedTexture(64, 64, new Uint8Array(tex));
          dev.setSpriteAux(t, { normal: new Uint8Array(nrm) });
          dev.setLighting({
            enabled: true,
            ambient: amb,
            sunDir: [0, 0, 1],
            normalStrength: s,
            lightCount: 2,
            lightsUbo: new Float32Array(u),
            cameraDelta: [0, 0],
            parallaxFactor: 0,
            time: 0,
          });
          const cam = new F2R.Camera2D();
          cam.x = 32;
          cam.y = 32;
          const b = new F2R.SpriteBatch();
          b.pushRect(t, 0, 0, 64, 64, 0, 0, 64, 64, 1);
          dev.beginFrame([0, 0, 0, 1]);
          dev.drawSprites(b, cam);
          dev.endFrame();
          return w.rd(dev);
        },
        [Array.from(PAL), texData(), normal, ubo, ambient, strength] as const,
      );
      const px = flip(got, 64, 64);
      let maxDiff = 0;
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 64; x++) {
          const n8 = (c: number) => (normal[(y * 64 + x) * 4 + c]! / 255) * 2 - 1;
          const exp = shadePixel(
            [200 / 255, 150 / 255, 100 / 255],
            [n8(0), n8(1), n8(2)],
            [x + 0.5, y + 0.5, 0],
            ambient,
            1,
            lights,
            strength,
          );
          for (let c = 0; c < 3; c++)
            maxDiff = Math.max(
              maxDiff,
              Math.abs(px[(y * 64 + x) * 4 + c]! - Math.round(exp[c]! * 255)),
            );
        }
      expect(maxDiff, `strength ${strength}`).toBeLessThanOrEqual(3);
      // prawa dolna cwiartka (idx 0) przezroczysta = tlo
      expect(px.slice((50 * 64 + 50) * 4, (50 * 64 + 50) * 4 + 3)).toEqual([0, 0, 0]);
    }
  });

  it('lit: 17 swiatel uzywa 16 bez bledu GL', async () => {
    const lights: PointLight[] = Array.from({ length: 17 }, (_, i) => ({
      x: i * 3,
      y: 20,
      z: 8,
      color: [1, 1, 1] as [number, number, number],
      radius: 20,
      intensity: 0.1,
    }));
    const r = await page.evaluate(
      ([pal, tex, u, n]) => {
        const dev = (window as any).mk(64, 64);
        dev.setPalette(new Uint8Array(pal));
        const t = dev.createIndexedTexture(64, 64, new Uint8Array(tex));
        dev.setLighting({
          enabled: true,
          ambient: [0.5, 0.5, 0.5],
          sunDir: [0, 0, 1],
          normalStrength: 0.6,
          lightCount: n,
          lightsUbo: new Float32Array(u),
          cameraDelta: [0, 0],
          parallaxFactor: 0,
          time: 0,
        });
        const cam = new F2R.Camera2D();
        cam.x = 32;
        cam.y = 32;
        const b = new F2R.SpriteBatch();
        b.pushRect(t, 0, 0, 64, 64, 0, 0, 64, 64, 1);
        dev.beginFrame([0, 0, 0, 1]);
        dev.drawSprites(b, cam);
        dev.endFrame();
        const gl = (document.getElementById('c') as HTMLCanvasElement).getContext(
          'webgl2',
        ) as WebGL2RenderingContext;
        return gl.getError();
      },
      [Array.from(PAL), texData(), Array.from(packLights(lights).data), 17] as const,
    );
    expect(r).toBe(0);
  });

  it('lightmapa per hex: transformacja swiat->hex trafia w jasny hex', async () => {
    const hx = 100;
    const hy = 100;
    const hex = hy * 200 + hx;
    const c = hexToWorld(hex);
    const data: number[] = new Array(200 * 200 * 3).fill(64);
    {
      const i = (hy * 200 + hx) * 3;
      data[i] = data[i + 1] = data[i + 2] = 255;
    }
    const got = await page.evaluate(
      ([pal, tex, cx, cy, lm]) => {
        const w = window as any;
        const dev = w.mk(64, 64);
        dev.setPalette(new Uint8Array(pal));
        const t = dev.createIndexedTexture(64, 64, new Uint8Array(tex));
        dev.setLighting({
          enabled: true,
          ambient: [1, 1, 1],
          sunDir: [0, 0, 1],
          normalStrength: 0,
          lightCount: 0,
          lightsUbo: new Float32Array(128),
          cameraDelta: [0, 0],
          parallaxFactor: 0,
          time: 0,
          lightMap: { data: new Uint8Array(lm), width: 200, height: 200, version: 1 },
        });
        const cam = new F2R.Camera2D();
        cam.x = cx;
        cam.y = cy;
        const b = new F2R.SpriteBatch();
        // sprite 32x32 (idx 1) wyśrodkowany na (cx,cy)
        b.pushRect(t, 0, 0, 32, 32, cx - 32, cy - 32, 64, 64, 1);
        dev.beginFrame([0, 0, 0, 1]);
        dev.drawSprites(b, cam);
        dev.endFrame();
        return w.rd(dev);
      },
      [Array.from(PAL), texData(), c.x, c.y, data] as const,
    );
    const px = flip(got, 64, 64);
    const r = (x: number, y: number) => px[(y * 64 + x) * 4]!;
    // srodek (32,32) = swiat hex(100,100): ~255*200/255 ; rog sprite'a daleko od hexa: ~64*200/255
    // jitter parzystosci (+-8 px) przesuwa pik, wiec szukamy maksimum blisko srodka
    let near = 0;
    for (let y = 20; y <= 44; y++) for (let x = 20; x <= 44; x++) near = Math.max(near, r(x, y));
    expect(near).toBeGreaterThan(150);
    expect(r(2, 2)).toBeLessThan(near - 40);
    expect(r(62, 62)).toBeLessThan(near - 40);
  });

  it('parallax: dach (warstwa 1) +1 px, kafel (0) -1 px, obiekt (0.5) 0 px przy delta 100, factor 0.02', async () => {
    const got = await page.evaluate(
      ([pal, tex]) => {
        const w = window as any;
        const dev = w.mk(64, 64);
        dev.setPalette(new Uint8Array(pal));
        const t = dev.createIndexedTexture(64, 64, new Uint8Array(tex));
        dev.setLighting({
          enabled: true,
          ambient: [1, 1, 1],
          sunDir: [0, 0, 1],
          normalStrength: 0,
          lightCount: 0,
          lightsUbo: new Float32Array(128),
          cameraDelta: [100, 0],
          parallaxFactor: 0.02,
          time: 0,
        });
        const cam = new F2R.Camera2D();
        cam.x = 32;
        cam.y = 32;
        const b = new F2R.SpriteBatch();
        b.currentLayer = 0;
        b.pushRect(t, 0, 0, 8, 8, 10, 4, 8, 8, 1);
        b.currentLayer = 0.5;
        b.pushRect(t, 0, 0, 8, 8, 10, 20, 8, 8, 1);
        b.currentLayer = 1;
        b.pushRect(t, 0, 0, 8, 8, 10, 36, 8, 8, 1);
        dev.beginFrame([0, 0, 0, 1]);
        dev.drawSprites(b, cam);
        dev.endFrame();
        return w.rd(dev);
      },
      [Array.from(PAL), texData()] as const,
    );
    const px = flip(got, 64, 64);
    const firstCol = (y: number) => {
      for (let x = 0; x < 64; x++) if (px[(y * 64 + x) * 4]! > 0) return x;
      return -1;
    };
    expect(firstCol(8)).toBe(9); // warstwa 0: 10 - 1
    expect(firstCol(24)).toBe(10); // warstwa 0.5: bez zmiany
    expect(firstCol(40)).toBe(11); // warstwa 1: 10 + 1
  });
});
