import type { Camera2D } from '../camera.js';
import { COLOR_GRADING_FRAG, COLOR_GRADING_VERT } from '../lighting/color-grading.js';
import {
  FULLSCREEN_VERT,
  POINT_SHADOW_BLUR_FRAG,
  POINT_SHADOW_FRAG,
  POINT_SHADOW_VERT,
  SHADOW_BLUR_FRAG,
  SHADOW_FRAG,
  SHADOW_VERT,
} from '../lighting/shaders-shadow.js';
import { BILATERAL_FRAG, SSAO_FRAG, SSAO_VERT } from '../lighting/shaders-ssao.js';
import { MAX_POINT_SHADOWS, POINT_SHADOW_LIGHT_Z, sunSkewMatrix } from '../lighting/shadow-pass.js';
import { ssaoRingOffsets } from '../lighting/ssao-pass.js';
import type { Vec3 } from '../lighting/types.js';
import { isNeutralPostFx } from '../postfx/PostFx.js';
import { BLOOM_BLUR_FRAG, BLOOM_EXTRACT_FRAG, POSTFX_FRAG } from '../postfx/shaders.js';
import type { PostProcessConfig } from '../postprocess.js';
import type { SpriteGroup } from '../sprite-batch.js';

/** Glebia sceny to gl_FragDepth = glebia atlasu * 0.01; SSAO przeskalowuje ja z powrotem. */
const SCENE_DEPTH_SCALE = 100;

const AO_MULT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uAo;
out vec4 fragColor;
void main() {
  vec4 s = texture(uScene, vUv);
  fragColor = vec4(s.rgb * texture(uAo, vUv).r, s.a);
}
`;

export interface PassDeps {
  ensureIndices(sprites: number): void;
  ibo(): WebGLBuffer | null;
  texture(id: number): WebGLTexture | undefined;
  /** Tekstura RGBA (HD): alfa z kanalu A zamiast palety. */
  isRgba?(id: number): boolean;
  palette(): WebGLTexture | null;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

interface Prog {
  p: WebGLProgram;
  loc: (name: string) => WebGLUniformLocation | null;
}

type Stage = (src: WebGLTexture, dst: Target | null) => void;

/**
 * Petla passow: scena do FBO, potem opcjonalnie SSAO (bilateral), color grading i PostFx.
 * Cien (maska) liczony jest przed scena. Zasoby leniwe; bez aktywnych passow nic nie jest tworzone.
 */
export class PostPipeline {
  private progs = new Map<string, Prog>();
  private sceneColor: WebGLTexture | null = null;
  private sceneNormal: WebGLTexture | null = null;
  private sceneDepth: WebGLTexture | null = null;
  private sceneFbo: WebGLFramebuffer | null = null;
  private sceneW = 0;
  private sceneH = 0;
  private ping: Target[] = [];
  private mask: Target[] = [];
  private pointMask: Target[] = [];
  private ao: Target[] = [];
  private bloom: Target[] = [];
  private black: WebGLTexture | null = null;
  private lutTex: WebGLTexture | null = null;
  private lutSrc: unknown = null;
  private shadowVao: WebGLVertexArrayObject | null = null;
  private shadowVbo: WebGLBuffer | null = null;
  private shadowHbo: WebGLBuffer | null = null;
  private vtx = new Float32Array(0);
  private hts = new Float32Array(0);

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly deps: PassDeps,
  ) {}

  /** Po utracie kontekstu GL: zapomnij uchwyty (zasoby i tak zniknely), odtworza sie leniwie. */
  reset(): void {
    this.progs.clear();
    this.sceneColor = this.sceneNormal = this.sceneDepth = this.sceneFbo = null;
    this.sceneW = this.sceneH = 0;
    this.ping = [];
    this.mask = [];
    this.pointMask = [];
    this.ao = [];
    this.bloom = [];
    this.black = this.lutTex = null;
    this.lutSrc = null;
    this.shadowVao = this.shadowVbo = this.shadowHbo = null;
  }

  dispose(): void {
    const gl = this.gl;
    for (const t of [...this.ping, ...this.mask, ...this.pointMask, ...this.ao, ...this.bloom])
      this.delTarget(t);
    for (const t of [this.sceneColor, this.sceneNormal, this.sceneDepth, this.black, this.lutTex])
      if (t) gl.deleteTexture(t);
    if (this.sceneFbo) gl.deleteFramebuffer(this.sceneFbo);
    for (const p of this.progs.values()) gl.deleteProgram(p.p);
    if (this.shadowVao) gl.deleteVertexArray(this.shadowVao);
    if (this.shadowVbo) gl.deleteBuffer(this.shadowVbo);
    if (this.shadowHbo) gl.deleteBuffer(this.shadowHbo);
    this.reset();
  }

  // ---------- zasoby ----------

  private prog(name: string, vs: string, fs: string): Prog {
    const hit = this.progs.get(name);
    if (hit) return hit;
    const gl = this.gl;
    const p = gl.createProgram();
    if (!p) throw new Error('WebGL2 niedostepny');
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vs],
      [gl.FRAGMENT_SHADER, fs],
    ] as const) {
      const sh = gl.createShader(type);
      if (!sh) throw new Error('WebGL2 niedostepny');
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
        throw new Error(`Blad shadera (${name}): ${gl.getShaderInfoLog(sh) ?? ''}`);
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(`Blad linkowania (${name}): ${gl.getProgramInfoLog(p) ?? ''}`);
    const cache = new Map<string, WebGLUniformLocation | null>();
    const prog: Prog = {
      p,
      loc: (n) => {
        if (!cache.has(n)) cache.set(n, gl.getUniformLocation(p, n));
        return cache.get(n) ?? null;
      },
    };
    this.progs.set(name, prog);
    return prog;
  }

  private newTex(
    w: number,
    h: number,
    internal: number,
    format: number,
    type: number,
    filter: number,
  ): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture();
    if (!t) throw new Error('WebGL2 niedostepny');
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private newTarget(w: number, h: number, r8: boolean): Target {
    const gl = this.gl;
    const tex = r8
      ? this.newTex(w, h, gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.LINEAR)
      : this.newTex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('WebGL2 niedostepny');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }

  private delTarget(t: Target): void {
    this.gl.deleteTexture(t.tex);
    this.gl.deleteFramebuffer(t.fbo);
  }

  /** Para celow tego samego rozmiaru (odtwarzana przy zmianie rozmiaru). */
  private pair(list: Target[], w: number, h: number, r8: boolean): Target[] {
    if (list.length === 2 && list[0]!.w === w && list[0]!.h === h) return list;
    for (const t of list) this.delTarget(t);
    return [this.newTarget(w, h, r8), this.newTarget(w, h, r8)];
  }

  private ensureScene(w: number, h: number): void {
    if (this.sceneFbo && this.sceneW === w && this.sceneH === h) return;
    const gl = this.gl;
    for (const t of [this.sceneColor, this.sceneNormal, this.sceneDepth])
      if (t) gl.deleteTexture(t);
    if (this.sceneFbo) gl.deleteFramebuffer(this.sceneFbo);
    this.sceneColor = this.newTex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    this.sceneNormal = this.newTex(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
    this.sceneDepth = this.newTex(
      w,
      h,
      gl.DEPTH_COMPONENT24,
      gl.DEPTH_COMPONENT,
      gl.UNSIGNED_INT,
      gl.NEAREST,
    );
    const fbo = gl.createFramebuffer();
    if (!fbo) throw new Error('WebGL2 niedostepny');
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.sceneColor,
      0,
    );
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT1,
      gl.TEXTURE_2D,
      this.sceneNormal,
      0,
    );
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.sceneDepth, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('FBO sceny niekompletne');
    this.sceneFbo = fbo;
    this.sceneW = w;
    this.sceneH = h;
  }

  // ---------- scena ----------

  /** Binduje FBO sceny. `mrt`: normalne + glebia (dla SSAO). Wywolac po viewport, przed clear. */
  bindScene(w: number, h: number, mrt: boolean): void {
    const gl = this.gl;
    this.ensureScene(w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFbo);
    gl.drawBuffers(
      mrt ? [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1] : [gl.COLOR_ATTACHMENT0, gl.NONE],
    );
    if (mrt) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.ALWAYS); // malarz: zapisuje glebie ostatnio narysowanego sprite'a
      gl.depthMask(true);
    } else {
      gl.disable(gl.DEPTH_TEST);
    }
  }

  /** Wraca do FBO sceny (po przejsciu maski cienia). */
  sceneTarget(): WebGLFramebuffer | null {
    return this.sceneFbo;
  }

  // ---------- cienie ----------

  /** Renderuje maske cieni (R8, 1 = bez cienia) do tekstury, zwraca ja. */
  renderShadowMask(
    groups: readonly SpriteGroup[],
    camera: Camera2D,
    zoom: number,
    vw: number,
    vh: number,
    sunDir: Vec3,
    opts: { resolutionScale?: number; blurRadius?: number; opacity?: number; feather?: number },
    paletteMode: boolean,
  ): WebGLTexture {
    const gl = this.gl;
    const scale = opts.resolutionScale ?? 0.5;
    const mw = Math.max(1, Math.ceil(vw * scale));
    const mh = Math.max(1, Math.ceil(vh * scale));
    this.mask = this.pair(this.mask, mw, mh, true);
    const [a, b] = this.mask as [Target, Target];
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, mw, mh);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const pr = this.prog('shadow', SHADOW_VERT, SHADOW_FRAG);
    gl.useProgram(pr.p);
    if (!this.shadowVao) {
      this.shadowVao = gl.createVertexArray();
      this.shadowVbo = gl.createBuffer();
      this.shadowHbo = gl.createBuffer();
    }
    gl.bindVertexArray(this.shadowVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowHbo);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 4, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.deps.ibo());

    gl.uniform2f(pr.loc('uViewport'), vw, vh);
    gl.uniform2f(pr.loc('uCenter'), camera.x, camera.y);
    gl.uniform1f(pr.loc('uZoom'), zoom);
    gl.uniform1i(pr.loc('uAlphaAtlas'), 0);
    gl.uniform1i(pr.loc('uPalette'), 1);
    gl.uniform1i(pr.loc('uPaletteMode'), paletteMode ? 1 : 0);
    gl.uniform1f(pr.loc('uFeather'), opts.feather ?? 0.5);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.deps.palette());

    // przebieg 1: sylwetki skosem, blend MIN (najciemniejszy cien wygrywa)
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.MIN);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniformMatrix3fv(pr.loc('uSkew'), false, sunSkewMatrix(sunDir));
    gl.uniform1f(pr.loc('uOpacity'), opts.opacity ?? 0.45);
    gl.uniform1f(pr.loc('uCutout'), 0);
    this.drawShadowGeometry(groups);
    // przebieg 2: pod sylwetka nie ma cienia (nadpisanie 1.0, bez blendu)
    gl.disable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.uniformMatrix3fv(pr.loc('uSkew'), false, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    gl.uniform1f(pr.loc('uOpacity'), 0);
    gl.uniform1f(pr.loc('uCutout'), 1);
    this.drawShadowGeometry(groups);
    gl.bindVertexArray(null);

    // rozmycie: A -> B (poziomo), B -> A (pionowo)
    const radius = Math.min(16, Math.max(0, Math.round(opts.blurRadius ?? 3)));
    const bp = this.prog('shadow-blur', FULLSCREEN_VERT, SHADOW_BLUR_FRAG);
    gl.useProgram(bp.p);
    gl.uniform1i(bp.loc('uMask'), 0);
    gl.uniform1i(bp.loc('uRadius'), radius);
    gl.uniform2f(bp.loc('uTexel'), 1 / mw, 1 / mh);
    for (const [src, dst, dx, dy] of [
      [a, b, 1, 0],
      [b, a, 0, 1],
    ] as const) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(bp.loc('uDirection'), dx, dy);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    return a.tex;
  }

  /**
   * Cienie punktowe: maska RGBA (kanal k = swiatlo k z UBO, 1 = oswietlone), do 4 swiatel.
   * Sprite'y obiektow (warstwa 0.5) rzutowane radialnie od swiatla (wysokosc POINT_SHADOW_LIGHT_Z),
   * ciemnosc tlumiona odlegloscia i intensywnoscia swiatla; pod sylwetka brak cienia; potem gauss.
   * Zwraca teksture albo null, gdy nie ma swiatel.
   */
  renderPointShadowMask(
    groups: readonly SpriteGroup[],
    camera: Camera2D,
    zoom: number,
    vw: number,
    vh: number,
    lightsUbo: Float32Array,
    lightCount: number,
    opts: { resolutionScale?: number; blurRadius?: number; opacity?: number; feather?: number },
    paletteMode: boolean,
  ): WebGLTexture | null {
    const n = Math.min(MAX_POINT_SHADOWS, lightCount);
    if (n <= 0) return null;
    const gl = this.gl;
    const scale = opts.resolutionScale ?? 0.5;
    const mw = Math.max(1, Math.ceil(vw * scale));
    const mh = Math.max(1, Math.ceil(vh * scale));
    this.pointMask = this.pair(this.pointMask, mw, mh, false);
    const [a, b] = this.pointMask as [Target, Target];
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, mw, mh);
    gl.disable(gl.DEPTH_TEST);
    gl.colorMask(true, true, true, true);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const pr = this.prog('point-shadow', POINT_SHADOW_VERT, POINT_SHADOW_FRAG);
    gl.useProgram(pr.p);
    if (!this.shadowVao) {
      this.shadowVao = gl.createVertexArray();
      this.shadowVbo = gl.createBuffer();
      this.shadowHbo = gl.createBuffer();
    }
    gl.bindVertexArray(this.shadowVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowVbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowHbo);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 4, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.deps.ibo());
    gl.uniform2f(pr.loc('uViewport'), vw, vh);
    gl.uniform2f(pr.loc('uCenter'), camera.x, camera.y);
    gl.uniform1f(pr.loc('uZoom'), zoom);
    gl.uniform1i(pr.loc('uAlphaAtlas'), 0);
    gl.uniform1i(pr.loc('uPalette'), 1);
    gl.uniform1i(pr.loc('uPaletteMode'), paletteMode ? 1 : 0);
    gl.uniform1f(pr.loc('uFeather'), opts.feather ?? 0.5);
    gl.uniform1f(pr.loc('uLightZ'), POINT_SHADOW_LIGHT_Z);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.deps.palette());

    for (let k = 0; k < n; k++) {
      const o = k * 8;
      gl.uniform2f(pr.loc('uLight'), lightsUbo[o]!, lightsUbo[o + 1]!);
      gl.uniform1f(pr.loc('uRadius'), lightsUbo[o + 3]!);
      gl.uniform1f(pr.loc('uIntensity'), lightsUbo[o + 7]!);
      gl.colorMask(k === 0, k === 1, k === 2, k === 3);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.MIN);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform1f(pr.loc('uProject'), 1);
      gl.uniform1f(pr.loc('uOpacity'), opts.opacity ?? 0.45);
      gl.uniform1f(pr.loc('uCutout'), 0);
      this.drawShadowGeometry(groups);
      gl.disable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.uniform1f(pr.loc('uProject'), 0);
      gl.uniform1f(pr.loc('uOpacity'), 0);
      gl.uniform1f(pr.loc('uCutout'), 1);
      this.drawShadowGeometry(groups);
    }
    gl.colorMask(true, true, true, true);
    gl.bindVertexArray(null);

    const radius = Math.min(16, Math.max(0, Math.round(opts.blurRadius ?? 3)));
    const bp = this.prog('point-shadow-blur', FULLSCREEN_VERT, POINT_SHADOW_BLUR_FRAG);
    gl.useProgram(bp.p);
    gl.uniform1i(bp.loc('uMask'), 0);
    gl.uniform1i(bp.loc('uRadius'), radius);
    gl.uniform2f(bp.loc('uTexel'), 1 / mw, 1 / mh);
    for (const [src, dst, dx, dy] of [
      [a, b, 1, 0],
      [b, a, 0, 1],
    ] as const) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(bp.loc('uDirection'), dx, dy);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    return a.tex;
  }

  private drawShadowGeometry(groups: readonly SpriteGroup[]): void {
    const gl = this.gl;
    // HD: gdy w klatce sa grupy RGBA, tryb alfy przelaczany per grupa (bez nich nic sie nie zmienia)
    const isRgba = this.deps.isRgba;
    const anyRgba = !!isRgba && groups.some((g) => isRgba(g.texture.id));
    const modeLoc = anyRgba
      ? gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram, 'uPaletteMode')
      : null;
    for (const g of groups) {
      const tex = this.deps.texture(g.texture.id);
      if (!tex) continue;
      if (anyRgba) gl.uniform1i(modeLoc, isRgba!(g.texture.id) ? 0 : 1);
      // tylko obiekty (warstwa 0.5); wysokosc wierzcholka = odleglosc od dolnej krawedzi sprite'a
      const need = g.spriteCount * 16;
      if (this.vtx.length < need) this.vtx = new Float32Array(need);
      if (this.hts.length < g.spriteCount * 4) this.hts = new Float32Array(g.spriteCount * 4);
      let n = 0;
      for (let s = 0; s < g.spriteCount; s++) {
        if (g.layers[s * 4] !== 0.5) continue;
        const o = s * 16;
        let bottom = -Infinity;
        for (let k = 0; k < 4; k++) bottom = Math.max(bottom, g.vertices[o + k * 4 + 1]!);
        for (let k = 0; k < 4; k++) {
          this.hts[n * 4 + k] = bottom - g.vertices[o + k * 4 + 1]!;
          for (let c = 0; c < 4; c++) this.vtx[n * 16 + k * 4 + c] = g.vertices[o + k * 4 + c]!;
        }
        n++;
      }
      if (n === 0) continue;
      this.deps.ensureIndices(n);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowVbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.vtx.subarray(0, n * 16), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.shadowHbo);
      gl.bufferData(gl.ARRAY_BUFFER, this.hts.subarray(0, n * 4), gl.DYNAMIC_DRAW);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.drawElements(gl.TRIANGLES, n * 6, gl.UNSIGNED_INT, 0);
    }
  }

  // ---------- passy po scenie ----------

  private fs(pr: Prog, dst: Target | null, w: number, h: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fbo : null);
    if (dst) gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, dst ? dst.w : w, dst ? dst.h : h);
    gl.useProgram(pr.p);
  }

  private bind(unit: number, tex: WebGLTexture | null): void {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
  }

  /** Czy po scenie jest cos do zrobienia (potrzebny FBO sceny). */
  static needsScene(cfg: PostProcessConfig | null, lit: boolean): boolean {
    if (!cfg) return false;
    return !!(
      (cfg.ssao && lit) ||
      (cfg.grading && cfg.grading.mix > 0) ||
      (cfg.postFx && !isNeutralPostFx(cfg.postFx))
    );
  }

  /** Wykonuje passy po scenie i zapisuje wynik do domyslnego framebuffera. */
  finish(cfg: PostProcessConfig, lit: boolean, w: number, h: number): void {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    const stages: Stage[] = [];

    if (cfg.ssao && lit) {
      const ssao = cfg.ssao;
      const stage: Stage = (src, dst) => {
        const ao = this.renderAo(ssao, w, h);
        const pr = this.prog('ao-mult', FULLSCREEN_VERT, AO_MULT_FRAG);
        this.fs(pr, dst, w, h);
        this.bind(0, src);
        this.bind(1, ao);
        gl.uniform1i(pr.loc('uScene'), 0);
        gl.uniform1i(pr.loc('uAo'), 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      };
      stages.push(stage);
    }
    if (cfg.grading && cfg.grading.mix > 0) {
      const gr = cfg.grading;
      stages.push((src, dst) => {
        const pr = this.prog('grading', COLOR_GRADING_VERT, COLOR_GRADING_FRAG);
        const lutTex = this.lutTexture(gr.lut); // przed bind: tworzenie tekstury zmienia aktywna jednostke
        this.fs(pr, dst, w, h);
        this.bind(0, src);
        this.bind(1, lutTex);
        gl.uniform1i(pr.loc('uScene'), 0);
        gl.uniform1i(pr.loc('uLut'), 1);
        gl.uniform1f(pr.loc('uLutSize'), gr.lut.height);
        gl.uniform1f(pr.loc('uMix'), gr.mix);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      });
    }
    if (cfg.postFx && !isNeutralPostFx(cfg.postFx)) {
      const p = cfg.postFx;
      stages.push((src, dst) => {
        const bloom = p.bloomStrength > 0 ? this.renderBloom(src, p, w, h) : this.blackTex();
        const pr = this.prog('postfx', FULLSCREEN_VERT, POSTFX_FRAG);
        this.fs(pr, dst, w, h);
        this.bind(0, src);
        this.bind(1, bloom);
        gl.uniform1i(pr.loc('uScene'), 0);
        gl.uniform1i(pr.loc('uBloom'), 1);
        gl.uniform1i(pr.loc('uLut'), 2);
        gl.uniform1f(pr.loc('uLutSize'), 0);
        gl.uniform1f(pr.loc('uMix'), 0);
        gl.uniform1f(pr.loc('uGamma'), p.gamma);
        gl.uniform1f(pr.loc('uVignette'), p.vignette);
        gl.uniform1f(pr.loc('uGrain'), p.grain);
        gl.uniform1f(pr.loc('uTime'), cfg.time ?? 0);
        gl.uniform1f(pr.loc('uCrtScanlines'), p.crt.scanlines);
        gl.uniform1f(pr.loc('uCrtCurvature'), p.crt.curvature);
        gl.uniform1f(pr.loc('uCrtMask'), p.crt.mask);
        gl.uniform1f(pr.loc('uCrtEnabled'), p.crt.enabled ? 1 : 0);
        gl.uniform2f(pr.loc('uResolution'), w, h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      });
    }

    this.ping = this.pair(this.ping, w, h, false);
    let cur = this.sceneColor as WebGLTexture;
    let pi = 0;
    stages.forEach((stage, i) => {
      const last = i === stages.length - 1;
      const dst = last ? null : (this.ping[pi] as Target);
      stage(cur, dst);
      if (dst) {
        cur = dst.tex;
        pi ^= 1;
      }
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
  }

  /** SSAO (tryb pierscienia) + dwustronny blur separowalny; zwraca tekstura AO (R8). */
  private renderAo(
    o: { scale?: number; samples?: number; radiusPx?: number; strength?: number },
    w: number,
    h: number,
  ): WebGLTexture {
    const gl = this.gl;
    const scale = o.scale ?? 0.5;
    const aw = Math.max(1, Math.ceil(w * scale));
    const ah = Math.max(1, Math.ceil(h * scale));
    this.ao = this.pair(this.ao, aw, ah, true);
    const [a, b] = this.ao as [Target, Target];
    const samples = Math.min(8, Math.max(1, Math.round(o.samples ?? 8)));
    const ring = new Float32Array(16);
    ssaoRingOffsets(o.radiusPx ?? 12, samples).forEach(([x, y], i) => {
      ring[i * 2] = x;
      ring[i * 2 + 1] = y;
    });
    const sp = this.prog('ssao', SSAO_VERT, SSAO_FRAG);
    const black = this.blackTex(); // przed bind: tworzenie tekstury zmienia aktywna jednostke
    this.fs(sp, a, aw, ah);
    this.bind(0, this.sceneDepth);
    this.bind(1, this.sceneNormal);
    this.bind(2, black);
    gl.uniform1i(sp.loc('uDepth'), 0);
    gl.uniform1i(sp.loc('uNormal'), 1);
    gl.uniform1i(sp.loc('uNoise'), 2);
    gl.uniform1f(sp.loc('uStrength'), o.strength ?? 0.6);
    gl.uniform2f(sp.loc('uTexel'), 1 / aw, 1 / ah);
    gl.uniform1f(sp.loc('uDepthScale'), SCENE_DEPTH_SCALE);
    gl.uniform1i(sp.loc('uUseRing'), 1);
    gl.uniform1i(sp.loc('uSamples'), samples);
    gl.uniform2fv(sp.loc('uRing'), ring);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const bp = this.prog('bilateral', SSAO_VERT, BILATERAL_FRAG);
    for (const [src, dst, dx, dy] of [
      [a, b, 1, 0],
      [b, a, 0, 1],
    ] as const) {
      this.fs(bp, dst, aw, ah);
      this.bind(0, src.tex);
      this.bind(1, this.sceneDepth);
      gl.uniform1i(bp.loc('uAo'), 0);
      gl.uniform1i(bp.loc('uDepth'), 1);
      gl.uniform2f(bp.loc('uDirection'), dx, dy);
      gl.uniform2f(bp.loc('uTexel'), 1 / aw, 1 / ah);
      gl.uniform1f(bp.loc('uDepthScale'), SCENE_DEPTH_SCALE);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    return a.tex;
  }

  /** Bloom: ekstrakcja (z sila) na 1/4 rozdzielczosci i 2x rozmycie H+V. */
  private renderBloom(
    src: WebGLTexture,
    p: { bloomThreshold: number; bloomStrength: number },
    w: number,
    h: number,
  ): WebGLTexture {
    const gl = this.gl;
    const bw = Math.max(1, Math.ceil(w / 4));
    const bh = Math.max(1, Math.ceil(h / 4));
    this.bloom = this.pair(this.bloom, bw, bh, false);
    const [a, b] = this.bloom as [Target, Target];
    const ep = this.prog('bloom-extract', FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    this.fs(ep, a, bw, bh);
    this.bind(0, src);
    gl.uniform1i(ep.loc('uScene'), 0);
    gl.uniform1f(ep.loc('uThreshold'), p.bloomThreshold);
    gl.uniform1f(ep.loc('uStrength'), p.bloomStrength);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const bp = this.prog('bloom-blur', FULLSCREEN_VERT, BLOOM_BLUR_FRAG);
    for (let i = 0; i < 2; i++) {
      for (const [s, d, dx, dy] of [
        [a, b, 1, 0],
        [b, a, 0, 1],
      ] as const) {
        this.fs(bp, d, bw, bh);
        this.bind(0, s.tex);
        gl.uniform1i(bp.loc('uSrc'), 0);
        gl.uniform2f(bp.loc('uTexel'), 1 / bw, 1 / bh);
        gl.uniform2f(bp.loc('uDir'), dx, dy);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }
    return a.tex;
  }

  private blackTex(): WebGLTexture {
    if (this.black) return this.black;
    const gl = this.gl;
    const t = this.newTex(1, 1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]),
    );
    this.black = t;
    return t;
  }

  private lutTexture(lut: {
    width: number;
    height: number;
    data: Uint8Array | Uint8ClampedArray;
  }): WebGLTexture {
    if (this.lutTex && this.lutSrc === lut.data) return this.lutTex;
    const gl = this.gl;
    if (this.lutTex) gl.deleteTexture(this.lutTex);
    const t = this.newTex(lut.width, lut.height, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      lut.width,
      lut.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      ArrayBuffer.isView(lut.data)
        ? new Uint8Array(lut.data.buffer, lut.data.byteOffset, lut.data.byteLength)
        : Uint8Array.from(lut.data as ArrayLike<number>),
    );
    this.lutTex = t;
    this.lutSrc = lut.data;
    return t;
  }
}
