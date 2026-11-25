/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import {
  applyLutCpu,
  builtinLut,
  COLOR_GRADING_FRAG,
  COLOR_GRADING_VERT,
} from '../../src/lighting/color-grading.js';
import { blurCol, blurRow } from '../../src/lighting/shadow-pass.js';
import { FULLSCREEN_VERT, SHADOW_BLUR_FRAG } from '../../src/lighting/shaders-shadow.js';
import { BILATERAL_FRAG, SSAO_FRAG, SSAO_VERT } from '../../src/lighting/shaders-ssao.js';
import { bilateralBlurCpu, computeAoCpu, ssaoRingOffsets } from '../../src/lighting/ssao-pass.js';
import { PostFx } from '../../src/postfx/PostFx.js';
import { BLOOM_BLUR_FRAG, BLOOM_EXTRACT_FRAG, POSTFX_FRAG } from '../../src/postfx/shaders.js';
import { GPU_SKIP, launch, newPage } from './harness.js';

/**
 * Shadery petli passow na prawdziwym WebGL2 (chromium + swiftshader) vs referencje CPU, +-3/255.
 * Cel: RGBA8 (czytelny readPixels), wejscia: R8 / R32F / RGBA8, filtr NEAREST.
 */
const TOL = 3;

const LIB = `
window.G = (() => {
  const gl = document.getElementById('c').getContext('webgl2');
  const progs = new Map();
  const prog = (vs, fs) => {
    const key = vs + fs;
    if (progs.has(key)) return progs.get(key);
    const p = gl.createProgram();
    for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(t);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    progs.set(key, p);
    return p;
  };
  const tex = (w, h, kind, data) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (kind === 'r8') gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data && new Uint8Array(data));
    else if (kind === 'r32f') gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, data && new Float32Array(data));
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data && new Uint8Array(data));
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
    return t;
  };
  const target = (w, h) => {
    const t = tex(w, h, 'rgba', null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { t, fbo, w, h };
  };
  // textures: [unit, tex]; uniforms: name -> ['1f'|'1i'|'2f'|'2fv', ...]
  const run = (vs, fs, dst, textures, uniforms) => {
    const p = prog(vs, fs);
    gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    for (const [u, t] of textures) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t); }
    for (const [name, [type, ...v]] of Object.entries(uniforms)) {
      const l = gl.getUniformLocation(p, name);
      if (type === '2fv') gl.uniform2fv(l, new Float32Array(v[0]));
      else gl[type === '1f' ? 'uniform1f' : type === '1i' ? 'uniform1i' : 'uniform2f'](l, ...v);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return gl.getError();
  };
  const read = (dst) => {
    const out = new Uint8Array(dst.w * dst.h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.readPixels(0, 0, dst.w, dst.h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return Array.from(out);
  };
  return { gl, tex, target, run, read };
})();
`;

let browser: Browser;
let page: Page;
beforeAll(async () => {
  if (GPU_SKIP) return;
  browser = await launch();
  page = await newPage(browser);
  await page.addScriptTag({ content: LIB });
}, 120_000);
afterAll(async () => {
  await browser?.close();
});

/** Deterministyczny LCG 0..255. */
function rnd(n: number, seed: number): number[] {
  let s = seed;
  return Array.from({ length: n }, () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s >>> 24;
  });
}

function maxDiff(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  skip?: (i: number) => boolean,
): number {
  expect(a.length).toBe(b.length);
  let m = 0;
  for (let i = 0; i < a.length; i++) if (!skip?.(i)) m = Math.max(m, Math.abs(a[i]! - b[i]!));
  return m;
}

const redOf = (px: number[]): number[] => px.filter((_, i) => i % 4 === 0);

describe.skipIf(GPU_SKIP)('passy GPU vs referencje CPU (+-3/255)', () => {
  it('cien: rozmycie H+V = blurRow + blurCol', async () => {
    const W = 32;
    const H = 24;
    const mask = rnd(W * H, 11);
    const got = await page.evaluate(
      ([vs, fs, m, w, h]) => {
        const G = (window as any).G;
        const src = G.tex(w, h, 'r8', m);
        const a = G.target(w, h);
        const b = G.target(w, h);
        const e1 = G.run(vs, fs, a, [[0, src]], {
          uMask: ['1i', 0],
          uDirection: ['2f', 1, 0],
          uTexel: ['2f', 1 / w, 1 / h],
          uRadius: ['1i', 3],
        });
        const e2 = G.run(vs, fs, b, [[0, a.t]], {
          uMask: ['1i', 0],
          uDirection: ['2f', 0, 1],
          uTexel: ['2f', 1 / w, 1 / h],
          uRadius: ['1i', 3],
        });
        return { px: G.read(b), e: e1 || e2 };
      },
      [FULLSCREEN_VERT, SHADOW_BLUR_FRAG, mask, W, H] as const,
    );
    expect(got.e).toBe(0);
    const cpu = blurCol(blurRow(Uint8Array.from(mask), W, H, 3), W, H, 3);
    expect(maxDiff(redOf(got.px), cpu)).toBeLessThanOrEqual(TOL);
  });

  it('SSAO (pierscien) = computeAoCpu', async () => {
    const W = 24;
    const H = 20;
    // glebia kwantyzowana co 0.05: roznice zawsze 0 albo >= 0.05 (bez remisow na progu 0.02)
    const depth = rnd(W * H, 5).map((v) => Math.floor(v / 64) * 0.05);
    for (let y = 6; y < 12; y++) for (let x = 8; x < 14; x++) depth[y * W + x] = 0.8;
    const radius = 4;
    const strength = 0.8;
    const ring = ssaoRingOffsets(radius, 8).flat();
    const got = await page.evaluate(
      ([vs, fs, d, w, h, r, st]) => {
        const G = (window as any).G;
        const dt = G.tex(w, h, 'r32f', d);
        const a = G.target(w, h);
        const e = G.run(vs, fs, a, [[0, dt]], {
          uDepth: ['1i', 0],
          uNormal: ['1i', 0],
          uNoise: ['1i', 0],
          uStrength: ['1f', st],
          uTexel: ['2f', 1 / w, 1 / h],
          uDepthScale: ['1f', 1],
          uUseRing: ['1i', 1],
          uSamples: ['1i', 8],
          uRing: ['2fv', r],
        });
        return { px: G.read(a), e };
      },
      [SSAO_VERT, SSAO_FRAG, depth, W, H, ring, strength] as const,
    );
    expect(got.e).toBe(0);
    const cpu = computeAoCpu(Float32Array.from(depth), W, H, radius, strength, 8);
    expect(maxDiff(redOf(got.px), cpu)).toBeLessThanOrEqual(TOL);
    expect(Math.min(...cpu)).toBeLessThan(200); // test faktycznie sprawdza zaslanianie
  });

  it('bilateral: plaska glebia (wnetrze) = bilateralBlurCpu 2D; schodek glebi zachowany (wiersz)', async () => {
    const W = 20;
    const H = 20;
    const ao = rnd(W * H, 3);
    const flat = new Array<number>(W * H).fill(0.5);
    const run = (
      aoData: number[],
      depth: number[],
      w: number,
      h: number,
      passes: Array<[number, number]>,
    ) =>
      page.evaluate(
        ([vs, fs, a8, d, ww, hh, ps]) => {
          const G = (window as any).G;
          const dt = G.tex(ww, hh, 'r32f', d);
          let cur = G.tex(ww, hh, 'r8', a8);
          let last: any = null;
          let e = 0;
          for (const [dx, dy] of ps) {
            const t = G.target(ww, hh);
            e |= G.run(
              vs,
              fs,
              t,
              [
                [0, cur],
                [1, dt],
              ],
              {
                uAo: ['1i', 0],
                uDepth: ['1i', 1],
                uDirection: ['2f', dx, dy],
                uTexel: ['2f', 1 / ww, 1 / hh],
                uDepthScale: ['1f', 1],
              },
            );
            cur = t.t;
            last = t;
          }
          return { px: G.read(last), e };
        },
        [SSAO_VERT, BILATERAL_FRAG, aoData, depth, w, h, passes] as const,
      );
    const a = await run(ao, flat, W, H, [
      [1, 0],
      [0, 1],
    ]);
    expect(a.e).toBe(0);
    const cpu = bilateralBlurCpu(Uint8Array.from(ao), Float32Array.from(flat), W, H, 2);
    const g = redOf(a.px);
    let m = 0;
    for (let y = 2; y < H - 2; y++)
      for (let x = 2; x < W - 2; x++) m = Math.max(m, Math.abs(g[y * W + x]! - cpu[y * W + x]!));
    expect(m).toBeLessThanOrEqual(TOL);

    // wiersz 32x1 ze schodkiem glebi: pass poziomy = bilateralBlurCpu (wysokosc 1)
    const W2 = 32;
    const ao2 = Array.from({ length: W2 }, (_, i) => (i < 16 ? 40 : 220));
    const d2 = Array.from({ length: W2 }, (_, i) => (i < 16 ? 0.1 : 0.9));
    const b = await run(ao2, d2, W2, 1, [[1, 0]]);
    const cpu2 = bilateralBlurCpu(Uint8Array.from(ao2), Float32Array.from(d2), W2, 1, 2);
    const g2 = redOf(b.px);
    let m2 = 0;
    for (let x = 2; x < W2 - 2; x++) m2 = Math.max(m2, Math.abs(g2[x]! - cpu2[x]!));
    expect(m2).toBeLessThanOrEqual(TOL);
    expect(g2[15]).toBeLessThan(60); // krawedz glebi nie rozmywa AO miedzy plaszczyznami
    expect(g2[16]).toBeGreaterThan(200);
  });

  it('color grading: COLOR_GRADING_FRAG = applyLutCpu (wezly LUT 16, mix 1 i 0.5)', async () => {
    const lut = builtinLut('bg3-warm', 16);
    const S = 16;
    // kolory = wielokrotnosci 17 (wezly siatki LUT 16), brak interpolacji miedzy wezlami
    const src: number[] = [];
    const lv = rnd(S * S * 3, 21).map((v) => Math.round(v / 17) * 17);
    for (let i = 0; i < S * S; i++) src.push(lv[i * 3]!, lv[i * 3 + 1]!, lv[i * 3 + 2]!, 255);
    for (const mix of [1, 0.5]) {
      const got = await page.evaluate(
        ([vs, fs, s, ld, lw, lh, w, mx]) => {
          const G = (window as any).G;
          const scene = G.tex(w, w, 'rgba', s);
          const lt = G.tex(lw, lh, 'rgba', ld);
          const t = G.target(w, w);
          const e = G.run(
            vs,
            fs,
            t,
            [
              [0, scene],
              [1, lt],
            ],
            { uScene: ['1i', 0], uLut: ['1i', 1], uLutSize: ['1f', lh], uMix: ['1f', mx] },
          );
          return { px: G.read(t), e };
        },
        [
          COLOR_GRADING_VERT,
          COLOR_GRADING_FRAG,
          src,
          Array.from(lut.data),
          lut.width,
          lut.height,
          S,
          mix,
        ] as const,
      );
      expect(got.e).toBe(0);
      const cpu = applyLutCpu(Uint8Array.from(src), lut, 16, mix);
      expect(maxDiff(got.px, cpu), `mix ${mix}`).toBeLessThanOrEqual(TOL);
    }
  });

  it('PostFx: POSTFX_FRAG = PostFx.process (gamma, winieta, scanlines i maska CRT bez krzywizny)', async () => {
    const W = 21;
    const H = 15;
    const src: number[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        src.push(
          Math.round((x / (W - 1)) * 255),
          Math.round((y / (H - 1)) * 255),
          90 + ((x * 7 + y * 3) % 100),
          255,
        );
    const cases = [
      { gamma: 1.4, vignette: 0.35, crt: { enabled: false } },
      { gamma: 1, vignette: 0, crt: { enabled: true, scanlines: 0.3, curvature: 0, mask: 0.2 } },
    ] as const;
    for (const p of cases) {
      const fx = new PostFx(p as any);
      const params = fx.getParams();
      const got = await page.evaluate(
        ([vs, fs, s, w, h, pr]) => {
          const G = (window as any).G;
          const scene = G.tex(w, h, 'rgba', s);
          const black = G.tex(1, 1, 'rgba', [0, 0, 0, 255]);
          const t = G.target(w, h);
          const e = G.run(
            vs,
            fs,
            t,
            [
              [0, scene],
              [1, black],
              [2, black],
            ],
            {
              uScene: ['1i', 0],
              uBloom: ['1i', 1],
              uLut: ['1i', 2],
              uLutSize: ['1f', 0],
              uMix: ['1f', 0],
              uGamma: ['1f', pr.gamma],
              uVignette: ['1f', pr.vignette],
              uGrain: ['1f', 0],
              uTime: ['1f', 0],
              uCrtScanlines: ['1f', pr.crt.scanlines],
              uCrtCurvature: ['1f', pr.crt.curvature],
              uCrtMask: ['1f', pr.crt.mask],
              uCrtEnabled: ['1f', pr.crt.enabled ? 1 : 0],
              uResolution: ['2f', w, h],
            },
          );
          return { px: G.read(t), e };
        },
        [FULLSCREEN_VERT, POSTFX_FRAG, src, W, H, params] as const,
      );
      expect(got.e).toBe(0);
      const cpu = fx.process(Uint8ClampedArray.from(src), W, H, 0);
      expect(
        maxDiff(got.px, cpu, (i) => i % 4 === 3),
        JSON.stringify(p),
      ).toBeLessThanOrEqual(TOL);
    }
  });

  it('bloom: ekstrakcja i rozmycie kompiluja sie; sila skaluje wynik liniowo', async () => {
    const W = 8;
    const src: number[] = [];
    for (let i = 0; i < W * W; i++) src.push(255, 255, 255, 255);
    const out: number[][] = [];
    for (const strength of [1, 0.5]) {
      const r = await page.evaluate(
        ([vs, fe, fb, s, w, st]) => {
          const G = (window as any).G;
          const scene = G.tex(w, w, 'rgba', s);
          const a = G.target(w, w);
          const b = G.target(w, w);
          const e1 = G.run(vs, fe, a, [[0, scene]], {
            uScene: ['1i', 0],
            uThreshold: ['1f', 0.5],
            uStrength: ['1f', st],
          });
          const e2 = G.run(vs, fb, b, [[0, a.t]], {
            uSrc: ['1i', 0],
            uTexel: ['2f', 1 / w, 1 / w],
            uDir: ['2f', 1, 0],
          });
          return { ex: G.read(a), bl: G.read(b), e: e1 || e2 };
        },
        [FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG, BLOOM_BLUR_FRAG, src, W, strength] as const,
      );
      expect(r.e).toBe(0);
      out.push(r.ex);
    }
    expect(out[0]![0]).toBeGreaterThan(20);
    expect(Math.abs(out[1]![0]! - out[0]![0]! * 0.5)).toBeLessThanOrEqual(TOL);
  });
});
