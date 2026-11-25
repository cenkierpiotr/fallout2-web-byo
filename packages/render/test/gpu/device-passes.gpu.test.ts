/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { applyLutCpu, builtinLut } from '../../src/lighting/color-grading.js';
import { PostFx } from '../../src/postfx/PostFx.js';
import { GPU_SKIP, bundleDevice, launch, newPage } from './harness.js';

/** Petla passow w device.ts (setPostProcess): flaga off = klasyczny render, kazdy pass dziala end-to-end. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const F2R: {
  createWebGl2Device(c: HTMLCanvasElement): any;
  SpriteBatch: new () => any;
  Camera2D: new () => any;
};

let browser: Browser;
let page: Page;
const TOL = 3;

// kolory paleciowe na wezlach siatki LUT 16 (wielokrotnosci 17), zeby porownanie z applyLutCpu bylo dokladne
const PAL = (() => {
  const p = new Uint8Array(1024);
  p.set([204, 153, 102, 255], 4);
  p.set([34, 221, 85, 255], 8);
  return Array.from(p);
})();

const SETUP = `
window.mk = (w, h) => {
  const dev = F2R.createWebGl2Device(document.getElementById('c'));
  dev.resize(w, h, 1);
  return dev;
};
window.rd = (dev) => Array.from(dev.readPixels());
window.glErr = () => document.getElementById('c').getContext('webgl2').getError();
window.LIT = (extra) => Object.assign({
  enabled: true, ambient: [1, 1, 1], sunDir: [-0.6, 0.3, 0.74], normalStrength: 0, lightCount: 0,
  lightsUbo: new Float32Array(128), cameraDelta: [0, 0], parallaxFactor: 0, time: 0,
}, extra || {});
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

const W = 64;
function texData(): number[] {
  const d = new Array<number>(W * W).fill(1);
  for (let y = 32; y < 64; y++) for (let x = 32; x < 64; x++) d[y * W + x] = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) d[y * W + x] = 2;
  return d;
}

/** Scena: tlo 64x64 (warstwa 0) i obiekt 12x12 (warstwa 0.5) z idx 2; `cfg` wykonywany po utworzeniu urzadzenia. */
const RUN = `
(args) => {
  const [pal, tex, depth, post, lit] = args;
  const dev = window.mk(64, 64);
  dev.setPalette(new Uint8Array(pal));
  const t = dev.createIndexedTexture(64, 64, new Uint8Array(tex));
  if (depth) dev.setSpriteAux(t, { depth: new Uint8Array(depth) });
  if (lit) dev.setLighting(window.LIT());
  const cam = new F2R.Camera2D();
  cam.x = 32; cam.y = 32;
  const draw = () => {
    const b = new F2R.SpriteBatch();
    b.currentLayer = 0; b.pushRect(t, 0, 0, 32, 32, 0, 0, 64, 64, 1);
    b.currentLayer = 0.5; b.pushRect(t, 0, 0, 8, 8, 24, 24, 12, 12, 1);
    dev.beginFrame([0, 0, 0, 1]);
    dev.drawSprites(b, cam);
    dev.endFrame();
    return window.rd(dev);
  };
  const classic = draw();
  const err0 = window.glErr();
  if (post) dev.setPostProcess(post);
  const out = draw();
  const err1 = window.glErr();
  dev.setPostProcess(null);
  const back = draw();
  return { classic, out, back, err: err0 || err1 };
}`;

const sum = (px: number[]): number => px.reduce((a, b, i) => (i % 4 === 3 ? a : a + b), 0);

async function scene(post: unknown, lit: boolean, depth?: number[]) {
  return page.evaluate(
    `(${RUN})(${JSON.stringify([PAL, texData(), depth ?? null, post, lit])})`,
  ) as Promise<{
    classic: number[];
    out: number[];
    back: number[];
    err: number;
  }>;
}

/**
 * Scena ze swiatlem punktowym (L=(8,30), z=40 px, promien 200), ambient 0.3: tlo + obiekt 12x12 na (24,24).
 * `post` ustawiane po klasycznym rysunku; zwraca klatke z cieniami punktowymi, bez nich i po wylaczeniu.
 */
const RUN_POINT = `
(args) => {
  const [pal, tex, post, lights] = args;
  const dev = window.mk(64, 64);
  dev.setPalette(new Uint8Array(pal));
  const t = dev.createIndexedTexture(64, 64, new Uint8Array(tex));
  const ubo = new Float32Array(128);
  lights.forEach((l, i) => ubo.set(l, i * 8));
  dev.setLighting(window.LIT({ ambient: [0.3, 0.3, 0.3], lightCount: lights.length, lightsUbo: ubo }));
  const cam = new F2R.Camera2D();
  cam.x = 32; cam.y = 32;
  const draw = () => {
    const b = new F2R.SpriteBatch();
    b.currentLayer = 0; b.pushRect(t, 0, 0, 32, 32, 0, 0, 64, 64, 1);
    b.currentLayer = 0.5; b.pushRect(t, 0, 0, 8, 8, 24, 24, 12, 12, 1);
    dev.beginFrame([0, 0, 0, 1]);
    dev.drawSprites(b, cam);
    dev.endFrame();
    return window.rd(dev);
  };
  const classic = draw();
  dev.setPostProcess(post.sun);
  const sun = draw();
  dev.setPostProcess(post.points);
  const points = draw();
  const err = window.glErr();
  dev.setPostProcess(null);
  const back = draw();
  return { classic, sun, points, back, err };
}`;

async function pointScene(lights: number[][]) {
  return page.evaluate(
    `(${RUN_POINT})(${JSON.stringify([PAL, texData(), { sun: { shadows: {} }, points: { shadows: { points: true } } }, lights])})`,
  ) as Promise<{ classic: number[]; sun: number[]; points: number[]; back: number[]; err: number }>;
}

/**
 * Scena z obiektem 12x12 na (24,24) w osobnej teksturze 8x8 z glebia 200 (tlo: glebia 0), ambient 1,
 * slonce (-0.6, 0.3, 0.74). Zwraca klatke klasyczna (lit) i po kazdej konfiguracji post.
 */
const RUN_MULTI = `
(args) => {
  const [pal, tex, posts] = args;
  const dev = window.mk(64, 64);
  dev.setPalette(new Uint8Array(pal));
  const t = dev.createIndexedTexture(64, 64, new Uint8Array(tex));
  const t2 = dev.createIndexedTexture(8, 8, new Uint8Array(64).fill(2));
  dev.setSpriteAux(t2, { depth: new Uint8Array(64).fill(200) });
  dev.setLighting(window.LIT());
  const cam = new F2R.Camera2D();
  cam.x = 32; cam.y = 32;
  const draw = () => {
    const b = new F2R.SpriteBatch();
    b.currentLayer = 0; b.pushRect(t, 0, 0, 32, 32, 0, 0, 64, 64, 1);
    b.currentLayer = 0.5; b.pushRect(t2, 0, 0, 8, 8, 24, 24, 12, 12, 1);
    dev.beginFrame([0, 0, 0, 1]);
    dev.drawSprites(b, cam);
    dev.endFrame();
    return window.rd(dev);
  };
  const classic = draw();
  const outs = posts.map((p) => { dev.setPostProcess(p); return draw(); });
  return { classic, outs, err: window.glErr() };
}`;

async function multi(posts: unknown[]) {
  return page.evaluate(`(${RUN_MULTI})(${JSON.stringify([PAL, texData(), posts])})`) as Promise<{
    classic: number[];
    outs: number[][];
    err: number;
  }>;
}

/** Piksel (x, y) liczony od gory; readPixels zwraca wiersze od dolu. */
const px = (img: number[], x: number, y: number, c = 0): number =>
  img[((W - 1 - y) * W + x) * 4 + c]!;

describe.skipIf(GPU_SKIP)('device WebGL2: petla passow (setPostProcess)', () => {
  it('flaga off: null, {}, neutralne parametry = klasyczny render bajt w bajt (z oswietleniem i bez)', async () => {
    for (const lit of [false, true]) {
      for (const post of [null, {}, { postFx: null, ssao: null, shadows: null, grading: null }]) {
        const r = await scene(post, lit);
        expect(r.err).toBe(0);
        expect(r.out, `lit=${lit} ${JSON.stringify(post)}`).toEqual(r.classic);
        expect(r.back).toEqual(r.classic);
      }
    }
  });

  it('color grading: wynik = applyLutCpu(klasyczny render) +-3', async () => {
    const lut = builtinLut('bg3-warm', 16);
    for (const lit of [false, true]) {
      const r = await scene(
        {
          grading: {
            lut: { width: lut.width, height: lut.height, data: Array.from(lut.data) },
            mix: 1,
          },
        },
        lit,
      );
      expect(r.err).toBe(0);
      const cpu = applyLutCpu(Uint8Array.from(r.classic), lut, 16, 1);
      let m = 0;
      for (let i = 0; i < cpu.length; i++)
        if (i % 4 !== 3) m = Math.max(m, Math.abs(r.out[i]! - cpu[i]!));
      expect(m, `lit=${lit}`).toBeLessThanOrEqual(TOL);
      expect(r.out).not.toEqual(r.classic);
      expect(r.back).toEqual(r.classic); // wylaczenie wraca do sciezki klasycznej
    }
  });

  it('PostFx (gamma, winieta, CRT): wynik = PostFx.process(klasyczny render) +-3', async () => {
    const p = {
      gamma: 1.3,
      bloomThreshold: 0.8,
      bloomStrength: 0,
      vignette: 0.3,
      grain: 0,
      crt: { enabled: true, scanlines: 0.25, curvature: 0, mask: 0.15 },
    };
    const r = await scene({ postFx: p, time: 0 }, false);
    expect(r.err).toBe(0);
    const cpu = new PostFx(p).process(Uint8ClampedArray.from(r.classic), 64, 64, 0);
    let m = 0;
    for (let i = 0; i < cpu.length; i++)
      if (i % 4 !== 3) m = Math.max(m, Math.abs(r.out[i]! - cpu[i]!));
    expect(m).toBeLessThanOrEqual(TOL);
    expect(r.back).toEqual(r.classic);
  });

  it('PostFx z bloomem: brak bledu GL, jasne miejsca rozjasnione', async () => {
    const p = {
      gamma: 1,
      bloomThreshold: 0.3,
      bloomStrength: 0.6,
      vignette: 0,
      grain: 0,
      crt: { enabled: false, scanlines: 0.25, curvature: 0, mask: 0.15 },
    };
    const r = await scene({ postFx: p }, false);
    expect(r.err).toBe(0);
    expect(sum(r.out)).toBeGreaterThan(sum(r.classic));
  });

  it('cienie sloneczne (lit): brak bledu GL, scena ciemniejsza, wylaczenie przywraca klasyke', async () => {
    const r = await scene({ shadows: {} }, true);
    expect(r.err).toBe(0);
    expect(sum(r.out)).toBeLessThan(sum(r.classic));
    expect(r.back).toEqual(r.classic);
  });

  it('cienie punktowe: probka za obiektem (przeciwna do swiatla) ciemniejsza, reszta bez zmian +-3', async () => {
    // swiatlo po lewej od obiektu: [x, y, z, radius, r, g, b, intensity]
    const r = await pointScene([[8, 30, 40, 200, 1, 1, 1, 1]]);
    expect(r.err).toBe(0);
    // za obiektem (na prawo od jego prawej krawedzi x=36, w stozku cienia)
    const inShadow = px(r.points, 38, 28);
    const noPoint = px(r.sun, 38, 28);
    expect(noPoint - inShadow).toBeGreaterThan(6);
    // daleko od cienia (lewy gorny rog, nad stozkiem) i po stronie swiatla: bez zmian
    for (const [x, y] of [
      [2, 2],
      [60, 60],
      [14, 30],
      [30, 56],
      [52, 28],
    ] as const) {
      expect(Math.abs(px(r.points, x, y) - px(r.sun, x, y)), `(${x},${y})`).toBeLessThanOrEqual(
        TOL,
      );
    }
    // swiatlo realnie oswietla (bez cieni punktowych jasniej niz sam ambient)
    expect(sum(r.sun)).toBeGreaterThan(sum(r.classic) * 0.3);
    expect(r.back).toEqual(r.classic);
  });

  it('cienie punktowe: bez swiatel w UBO = taki sam obraz jak same cienie sloneczne', async () => {
    const r = await pointScene([]);
    expect(r.err).toBe(0);
    expect(r.points).toEqual(r.sun);
  });

  it('cienie punktowe: cien odwraca sie wraz z polozeniem swiatla', async () => {
    // swiatlo po prawej: cien po lewej od obiektu (x ~ 22), prawa strona (38) bez cienia; probka 3 px od krawedzi (x=24)
    const r = await pointScene([[56, 30, 40, 200, 1, 1, 1, 1]]);
    expect(r.err).toBe(0);
    expect(px(r.sun, 21, 28) - px(r.points, 21, 28)).toBeGreaterThan(6);
    expect(Math.abs(px(r.sun, 40, 28) - px(r.points, 40, 28))).toBeLessThanOrEqual(TOL);
  });

  it('cienie bez oswietlenia: ignorowane (render = klasyczny)', async () => {
    const r = await scene({ shadows: {} }, false);
    expect(r.err).toBe(0);
    expect(r.out).toEqual(r.classic);
  });

  it('SSAO (lit + mapa glebi): brak bledu GL, krawedzie przyciemnione; bez lit ignorowane', async () => {
    const depth = new Array<number>(W * W).fill(0);
    for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) depth[y * W + x] = 200;
    const r = await scene({ ssao: { radiusPx: 6, strength: 0.8 } }, true, depth);
    expect(r.err).toBe(0);
    expect(sum(r.out)).toBeLessThan(sum(r.classic));
    expect(r.back).toEqual(r.classic);
    const off = await scene({ ssao: { radiusPx: 6, strength: 0.8 } }, false, depth);
    expect(off.out).toEqual(off.classic);
  });

  it('cien sloneczny: pada w strone przeciwna do slonca (gora-lewo od obiektu), prawa strona i obiekt bez zmian', async () => {
    const r = await multi([{ shadows: {} }]);
    const sh = r.outs[0]!;
    expect(r.err).toBe(0);
    // slonce z lewej-gory (dir.x < 0): cien rzutowany na lewo i w gore od obiektu (x 24..36, y 24..36)
    for (const [x, y] of [
      [20, 28],
      [26, 20],
      [22, 22],
    ] as const)
      expect(px(r.classic, x, y) - px(sh, x, y), `cien (${x},${y})`).toBeGreaterThan(8);
    // po przeciwnej stronie, daleko od cienia, i sam obiekt: bez zmian +-3
    for (const [x, y] of [
      [50, 30],
      [44, 44],
      [60, 60],
      [4, 60],
      [30, 30],
    ] as const)
      expect(
        Math.abs(px(r.classic, x, y) - px(sh, x, y)),
        `bez cienia (${x},${y})`,
      ).toBeLessThanOrEqual(TOL);
  });

  it('SSAO: halo wokol obiektu z glebia (tlo przyciemnione), wnetrze obiektu i dalekie tlo bez zmian', async () => {
    const r = await multi([{ ssao: { radiusPx: 6, strength: 0.8 } }]);
    const ao = r.outs[0]!;
    expect(r.err).toBe(0);
    for (const [x, y] of [
      [20, 30],
      [40, 30],
      [30, 20],
      [30, 40],
    ] as const)
      expect(px(r.classic, x, y) - px(ao, x, y), `halo (${x},${y})`).toBeGreaterThan(8);
    // wnetrze obiektu i tlo poza promieniem 6 px (+ margines na rozmycie bilateralne)
    for (const [x, y] of [
      [30, 30],
      [60, 4],
      [4, 60],
      [60, 60],
      [4, 4],
    ] as const)
      expect(
        Math.abs(px(r.classic, x, y) - px(ao, x, y)),
        `bez AO (${x},${y})`,
      ).toBeLessThanOrEqual(TOL);
  });

  it('SSAO: mocniejsze strength = ciemniejsze halo; strength 0 = brak zmian', async () => {
    const r = await multi([
      { ssao: { radiusPx: 6, strength: 0.4 } },
      { ssao: { radiusPx: 6, strength: 1 } },
      { ssao: { radiusPx: 6, strength: 0 } },
    ]);
    expect(px(r.outs[1]!, 20, 30)).toBeLessThan(px(r.outs[0]!, 20, 30));
    expect(px(r.outs[0]!, 20, 30)).toBeLessThan(px(r.classic, 20, 30));
    expect(
      r.outs[2]!.map((v, i) => Math.abs(v - r.classic[i]!)).reduce((a, b) => Math.max(a, b), 0),
    ).toBeLessThanOrEqual(TOL);
  });

  it('grading na wierzchu cieni: wynik = applyLutCpu(klatka z cieniem) +-3; mix 0 = bez zmian', async () => {
    const lut = builtinLut('bg3-warm', 16);
    const g = (mix: number) => ({
      lut: { width: lut.width, height: lut.height, data: Array.from(lut.data) },
      mix,
    });
    const r = await multi([
      { shadows: {} },
      { shadows: {}, grading: g(1) },
      { shadows: {}, grading: g(0) },
    ]);
    expect(r.err).toBe(0);
    const cpu = applyLutCpu(Uint8Array.from(r.outs[0]!), lut, 16, 1);
    let m = 0;
    let m0 = 0;
    for (let i = 0; i < cpu.length; i++) {
      if (i % 4 === 3) continue;
      m = Math.max(m, Math.abs(r.outs[1]![i]! - cpu[i]!));
      m0 = Math.max(m0, Math.abs(r.outs[2]![i]! - r.outs[0]![i]!));
    }
    // kolory po cieniu leza miedzy wezlami LUT: GPU (interpolacja sprzetowa 8-bit) vs CPU, wiekszy margines niz na wezlach
    expect(m, `m=${m} m0=${m0}`).toBeLessThanOrEqual(10);
    expect(m0, `m=${m} m0=${m0}`).toBeLessThanOrEqual(TOL);
    expect(r.outs[1]).not.toEqual(r.outs[0]);
  });

  it('wszystkie passy naraz (lit): brak bledu GL i ciemniejsza scena niz klasyczna', async () => {
    const lut = builtinLut('retro-crt', 16);
    const depth = new Array<number>(W * W).fill(0);
    for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) depth[y * W + x] = 200;
    const r = await scene(
      {
        shadows: {},
        ssao: {},
        grading: {
          lut: { width: lut.width, height: lut.height, data: Array.from(lut.data) },
          mix: 0.8,
        },
        postFx: {
          gamma: 1,
          bloomThreshold: 0.8,
          bloomStrength: 0.2,
          vignette: 0.4,
          grain: 0,
          crt: { enabled: true, scanlines: 0.2, curvature: 0.02, mask: 0.1 },
        },
      },
      true,
      depth,
    );
    expect(r.err).toBe(0);
    expect(r.out).not.toEqual(r.classic);
    expect(r.back).toEqual(r.classic);
  });
});
