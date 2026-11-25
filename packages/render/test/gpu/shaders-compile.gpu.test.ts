import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { SSAO_VERT, SSAO_FRAG, BILATERAL_FRAG } from '../../src/lighting/shaders-ssao.js';
import {
  SHADOW_VERT,
  SHADOW_FRAG,
  SHADOW_BLUR_FRAG,
  FULLSCREEN_VERT,
} from '../../src/lighting/shaders-shadow.js';
import { SPRITE_LIT_VERT, SPRITE_LIT_FRAG } from '../../src/lighting/shaders-light.js';
import { GPU_SKIP, launch, newPage } from './harness.js';

let browser: Browser;
let page: Page;
beforeAll(async () => {
  if (GPU_SKIP) return;
  browser = await launch();
  page = await newPage(browser);
}, 120_000);
afterAll(async () => {
  await browser?.close();
});

const PAIRS: Array<[string, string, string]> = [
  ['lit', SPRITE_LIT_VERT, SPRITE_LIT_FRAG],
  ['shadow', SHADOW_VERT, SHADOW_FRAG],
  ['shadow-blur', FULLSCREEN_VERT, SHADOW_BLUR_FRAG],
  ['ssao', SSAO_VERT, SSAO_FRAG],
  ['bilateral', SSAO_VERT, BILATERAL_FRAG],
];

describe.skipIf(GPU_SKIP)('shadery M9: kompilacja i linkowanie w WebGL2', () => {
  for (const [name, vs, fs] of PAIRS) {
    it(`${name} kompiluje sie i linkuje`, async () => {
      const log = await page.evaluate(
        ([v, f]) => {
          const gl = (document.getElementById('c') as HTMLCanvasElement).getContext('webgl2')!;
          const sh = (type: number, src: string) => {
            const s = gl.createShader(type)!;
            gl.shaderSource(s, src);
            gl.compileShader(s);
            return gl.getShaderParameter(s, gl.COMPILE_STATUS)
              ? ''
              : (gl.getShaderInfoLog(s) ?? 'blad');
          };
          const ev = sh(gl.VERTEX_SHADER, v!);
          const ef = sh(gl.FRAGMENT_SHADER, f!);
          if (ev || ef) return `vs: ${ev} fs: ${ef}`;
          const p = gl.createProgram()!;
          gl.attachShader(
            p,
            (() => {
              const s = gl.createShader(gl.VERTEX_SHADER)!;
              gl.shaderSource(s, v!);
              gl.compileShader(s);
              return s;
            })(),
          );
          gl.attachShader(
            p,
            (() => {
              const s = gl.createShader(gl.FRAGMENT_SHADER)!;
              gl.shaderSource(s, f!);
              gl.compileShader(s);
              return s;
            })(),
          );
          gl.linkProgram(p);
          return gl.getProgramParameter(p, gl.LINK_STATUS)
            ? ''
            : (gl.getProgramInfoLog(p) ?? 'link');
        },
        [vs, fs],
      );
      expect(log).toBe('');
    });
  }
});
