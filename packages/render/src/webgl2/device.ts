import type { Camera2D } from '../camera.js';
import type { DeviceFrameStats, GfxDevice, IndexedTexture } from '../gfx-device.js';
import { FLOATS_PER_VERTEX, VERTS_PER_SPRITE, type SpriteBatch } from '../sprite-batch.js';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders.js';
import { SPRITE_LIT_FRAG, SPRITE_LIT_VERT } from '../lighting/shaders-light.js';
import { LIGHT_FIELD_TRANSFORM } from '../lighting/light-field-transform.js';
import type { LitFrameState } from '../lighting/types.js';
import { isPostProcessActive, type PostProcessConfig } from '../postprocess.js';
import { PostPipeline } from './passes.js';
import { RGBA_FRAGMENT_SHADER, premultiplyRgba } from '../hd-rgba.js';

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('WebGL2 niedostepny');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(`Blad shadera: ${gl.getShaderInfoLog(sh) ?? ''}`);
  }
  return sh;
}

export function createWebGl2Device(canvas: HTMLCanvasElement): GfxDevice {
  const ctx = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  if (!ctx) throw new Error('WebGL2 niedostepny');
  const gl: WebGL2RenderingContext = ctx;

  interface Res {
    program: WebGLProgram;
    vao: WebGLVertexArrayObject | null;
    vbo: WebGLBuffer | null;
    lbo: WebGLBuffer | null;
    ibo: WebGLBuffer | null;
    /** Liczba sprite'ow, dla ktorych indeksy sa w ibo (statyczny wzor 0,1,2,2,1,3 + 4i). */
    indexCapacity: number;
    paletteTex: WebGLTexture | null;
    uViewport: WebGLUniformLocation | null;
    uCenter: WebGLUniformLocation | null;
    uZoom: WebGLUniformLocation | null;
    uIndexed: WebGLUniformLocation | null;
    uPalette: WebGLUniformLocation | null;
  }

  function createResources(): Res {
    const program = gl.createProgram();
    if (!program) throw new Error('WebGL2 niedostepny');
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Blad linkowania: ${gl.getProgramInfoLog(program) ?? ''}`);
    }
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    const ibo = gl.createBuffer();
    const lbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindBuffer(gl.ARRAY_BUFFER, lbo);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 4, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bindVertexArray(null);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const paletteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, palette);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return {
      program,
      vao,
      vbo,
      lbo,
      ibo,
      indexCapacity: 0,
      paletteTex,
      uViewport: gl.getUniformLocation(program, 'uViewport'),
      uCenter: gl.getUniformLocation(program, 'uCenter'),
      uZoom: gl.getUniformLocation(program, 'uZoom'),
      uIndexed: gl.getUniformLocation(program, 'uIndexed'),
      uPalette: gl.getUniformLocation(program, 'uPalette'),
    };
  }

  function allocTexture(width: number, height: number, data: Uint8Array | null): WebGLTexture {
    const tex = gl.createTexture();
    if (!tex) throw new Error('WebGL2 niedostepny');
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  function allocRgba(
    width: number,
    height: number,
    data: Uint8Array | null,
    linear: boolean,
  ): WebGLTexture {
    const tex = gl.createTexture();
    if (!tex) throw new Error('WebGL2 niedostepny');
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data ? premultiplyRgba(data) : null,
    );
    const f = linear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  /** Program klasycznej sciezki RGBA; tworzony leniwie przy pierwszej grupie RGBA (flaga off: nigdy). */
  interface RgbaRes {
    program: WebGLProgram;
    uViewport: WebGLUniformLocation | null;
    uCenter: WebGLUniformLocation | null;
    uZoom: WebGLUniformLocation | null;
    uIndexed: WebGLUniformLocation | null;
  }
  let rgbaRes: RgbaRes | null = null;
  function createRgbaResources(): RgbaRes {
    const program = gl.createProgram();
    if (!program) throw new Error('WebGL2 niedostepny');
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, RGBA_FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Blad linkowania (rgba): ${gl.getProgramInfoLog(program) ?? ''}`);
    }
    return {
      program,
      uViewport: gl.getUniformLocation(program, 'uViewport'),
      uCenter: gl.getUniformLocation(program, 'uCenter'),
      uZoom: gl.getUniformLocation(program, 'uZoom'),
      uIndexed: gl.getUniformLocation(program, 'uIndexed'),
    };
  }

  const STRIDE = FLOATS_PER_VERTEX * 4;

  /** Zasoby sciezki oswietlenia 2.5D; tworzone leniwie przy pierwszym wlaczeniu (classic: zero kosztu). */
  interface LitRes {
    program: WebGLProgram;
    vao: WebGLVertexArrayObject | null;
    layerBo: WebGLBuffer | null;
    ubo: WebGLBuffer | null;
    lightMapTex: WebGLTexture | null;
    flatNormalTex: WebGLTexture | null;
    zeroDepthTex: WebGLTexture | null;
    whiteTex: WebGLTexture | null;
    lightMapVersion: number;
    lightMapSize: [number, number];
    uloc: Map<string, WebGLUniformLocation | null>;
  }
  let litRes: LitRes | null = null;
  let litState: LitFrameState | null = null;
  /** Petla passow (cienie, SSAO, grading, PostFx); null = sciezka klasyczna. Zasoby leniwie. */
  let postCfg: PostProcessConfig | null = null;
  let post: PostPipeline | null = null;
  /** Czy biezaca klatka idzie przez FBO sceny (ustalane w beginFrame). */
  let routed = false;
  const aux = new Map<number, { normal: WebGLTexture | null; depth: WebGLTexture | null }>();

  function tex1x1(rgba: [number, number, number, number], filter: number): WebGLTexture | null {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(rgba),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function createLitResources(): LitRes {
    const program = gl.createProgram();
    if (!program) throw new Error('WebGL2 niedostepny');
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, SPRITE_LIT_VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, SPRITE_LIT_FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Blad linkowania (lit): ${gl.getProgramInfoLog(program) ?? ''}`);
    }
    const vao = gl.createVertexArray();
    const layerBo = gl.createBuffer();
    const ubo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, res.ibo);
    // atrybuty 0,1 (pozycja, uv) z res.vbo sa ustawiane przy kazdej grupie; 3 = warstwa glebi
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.enableVertexAttribArray(3);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
    gl.bufferData(gl.UNIFORM_BUFFER, 16 * 8 * 4, gl.DYNAMIC_DRAW);
    gl.uniformBlockBinding(program, gl.getUniformBlockIndex(program, 'Lights'), 0);
    return {
      program,
      vao,
      layerBo,
      ubo,
      lightMapTex: tex1x1([255, 255, 255, 255], gl.LINEAR),
      flatNormalTex: tex1x1([128, 128, 255, 255], gl.NEAREST),
      zeroDepthTex: tex1x1([0, 0, 0, 255], gl.NEAREST),
      whiteTex: tex1x1([255, 255, 255, 255], gl.NEAREST),
      lightMapVersion: -1,
      lightMapSize: [1, 1],
      uloc: new Map(),
    };
  }

  function lu(name: string): WebGLUniformLocation | null {
    const L = litRes as LitRes;
    if (!L.uloc.has(name)) L.uloc.set(name, gl.getUniformLocation(L.program, name));
    return L.uloc.get(name) ?? null;
  }

  function allocAux(
    width: number,
    height: number,
    internal: number,
    format: number,
    data: Uint8Array,
  ): WebGLTexture | null {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function drawLit(
    batch: SpriteBatch,
    camera: Camera2D,
    st: LitFrameState,
    shadowMask: WebGLTexture | null,
    pointShadow: WebGLTexture | null = null,
  ): void {
    const L = litRes as LitRes;
    const groups = batch.groups();
    let floats = 0;
    let layerFloats = 0;
    let maxSprites = 0;
    for (const g of groups) {
      floats += g.vertices.length;
      layerFloats += g.layers.length;
      if (g.spriteCount > maxSprites) maxSprites = g.spriteCount;
    }
    gl.useProgram(L.program);
    gl.bindVertexArray(L.vao);
    ensureIndices(maxSprites);
    const zoom = camera.deviceZoom(dpr);
    gl.uniform2f(lu('uViewport'), canvas.width, canvas.height);
    gl.uniform2f(lu('uCenter'), camera.x, camera.y);
    gl.uniform1f(lu('uZoom'), zoom);
    gl.uniform2f(lu('uCameraDelta'), st.cameraDelta[0], st.cameraDelta[1]);
    gl.uniform1f(lu('uParallaxFactor'), st.parallaxFactor);
    gl.uniform1i(lu('uAtlas'), 0);
    gl.uniform1i(lu('uAtlasNormal'), 1);
    gl.uniform1i(lu('uAtlasDepth'), 2);
    gl.uniform1i(lu('uLightMap'), 3);
    gl.uniform1i(lu('uPalette'), 4);
    gl.uniform1i(lu('uShadowMask'), 5);
    gl.uniform1i(lu('uPointShadow'), 6);
    gl.uniform1f(lu('uUsePointShadow'), pointShadow ? 1 : 0);
    gl.uniform1i(lu('uPaletteMode'), 1);
    gl.uniform1f(lu('uUseShadowMask'), shadowMask ? 1 : 0);
    gl.uniform2f(lu('uViewport'), canvas.width, canvas.height);
    gl.uniform1i(lu('uLightCount'), Math.min(16, st.lightCount));
    gl.uniform3f(lu('uAmbient'), st.ambient[0], st.ambient[1], st.ambient[2]);
    gl.uniform3f(lu('uSunDir'), st.sunDir[0], st.sunDir[1], st.sunDir[2]);
    gl.uniform1f(lu('uNormalStrength'), st.normalStrength);
    gl.uniform1f(lu('uTime'), st.time);
    // swiatla (UBO, std140: 16 * 2 vec4)
    gl.bindBuffer(gl.UNIFORM_BUFFER, L.ubo);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, st.lightsUbo.subarray(0, 16 * 8));
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, L.ubo);
    // lightmapa per hex
    const lm = st.lightMap;
    if (lm) {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, L.lightMapTex);
      if (L.lightMapVersion !== lm.version || L.lightMapSize[0] !== lm.width) {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGB8,
          lm.width,
          lm.height,
          0,
          gl.RGB,
          gl.UNSIGNED_BYTE,
          lm.data,
        );
        L.lightMapVersion = lm.version;
        L.lightMapSize = [lm.width, lm.height];
      }
      gl.uniformMatrix2fv(lu('uLightMapInv'), false, LIGHT_FIELD_TRANSFORM.inv);
      gl.uniform2f(
        lu('uLightMapOrigin'),
        LIGHT_FIELD_TRANSFORM.origin[0],
        LIGHT_FIELD_TRANSFORM.origin[1],
      );
      gl.uniform2f(lu('uLightMapSize'), lm.width, lm.height);
    } else {
      // brak lightmapy: biala tekstura 1x1 (mnoznik 1)
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, L.whiteTex);
      gl.uniformMatrix2fv(lu('uLightMapInv'), false, [0, 0, 0, 0]);
      gl.uniform2f(lu('uLightMapOrigin'), 0, 0);
      gl.uniform2f(lu('uLightMapSize'), 1, 1);
    }
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, res.paletteTex);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, shadowMask ?? L.whiteTex);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, pointShadow ?? L.whiteTex);
    gl.vertexAttrib1f(2, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, res.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, floats * 4, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, L.layerBo);
    gl.bufferData(gl.ARRAY_BUFFER, layerFloats * 4, gl.DYNAMIC_DRAW);
    let layerOffset = 0;
    let rgbaMode = false;
    for (const g of groups) {
      gl.bufferSubData(gl.ARRAY_BUFFER, layerOffset, g.layers);
      layerOffset += g.layers.byteLength;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, res.vbo);
    let byteOffset = 0;
    layerOffset = 0;
    for (const g of groups) {
      const entry = textures.get(g.texture.id);
      const myLayerOffset = layerOffset;
      layerOffset += g.layers.byteLength;
      if (!entry) continue;
      if (!!entry.rgba !== rgbaMode) {
        // HD: albedo z tekstury (premultiplied) i blend alfa; indeksowane wracaja do palety bez blendu
        rgbaMode = !!entry.rgba;
        gl.uniform1i(lu('uPaletteMode'), rgbaMode ? 0 : 1);
        if (rgbaMode) {
          gl.enable(gl.BLEND);
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        } else gl.disable(gl.BLEND);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, byteOffset, g.vertices);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, byteOffset);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, byteOffset + 8);
      gl.bindBuffer(gl.ARRAY_BUFFER, L.layerBo);
      gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 4, myLayerOffset);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.vbo);
      const ax = aux.get(g.texture.id);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, entry.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, ax?.normal ?? L.flatNormalTex);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, ax?.depth ?? L.zeroDepthTex);
      gl.drawElements(gl.TRIANGLES, g.spriteCount * 6, gl.UNSIGNED_INT, 0);
      byteOffset += g.vertices.byteLength;
      stats.drawCalls++;
      stats.uploadedBytes += g.vertices.byteLength;
      stats.fillPixels += g.area * zoom * zoom;
    }
    if (rgbaMode) {
      gl.disable(gl.BLEND);
      gl.uniform1i(lu('uPaletteMode'), 1);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }

  /** Rozszerza statyczny bufor indeksow (wzor quada 0,1,2,2,1,3) do `sprites` sprite'ow; VAO musi byc zbindowany. */
  function ensureIndices(sprites: number): void {
    if (sprites <= res.indexCapacity) return;
    const cap = Math.max(sprites, res.indexCapacity * 2, 1024);
    const idx = new Uint32Array(cap * 6);
    for (let i = 0; i < cap; i++) {
      const v = i * VERTS_PER_SPRITE;
      const o = i * 6;
      idx[o] = v;
      idx[o + 1] = v + 1;
      idx[o + 2] = v + 2;
      idx[o + 3] = v + 2;
      idx[o + 4] = v + 1;
      idx[o + 5] = v + 3;
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, res.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    res.indexCapacity = cap;
  }

  /** Ostatnio ustawiona paleta (do odtworzenia po utracie kontekstu). */
  let palette: Uint8Array = new Uint8Array(1024);
  let res = createResources();
  let dpr = 1;
  let lost = false;
  const textures = new Map<
    number,
    { tex: WebGLTexture; width: number; height: number; rgba?: boolean; linear?: boolean }
  >();
  let nextId = 1;
  const stats: DeviceFrameStats = { drawCalls: 0, uploadedBytes: 0, fillPixels: 0 };

  const onLost = (e: Event): void => {
    e.preventDefault(); // pozwala przegladarce przywrocic kontekst
    lost = true;
    device.onContextLost?.();
  };
  const onRestored = (): void => {
    res = createResources();
    litRes = null; // shader oswietlenia odtworzy sie leniwie
    post?.reset(); // zasoby passow odtworza sie leniwie
    routed = false;
    aux.clear(); // normal/depth wymagaja ponownego wgrania
    for (const t of textures.values())
      t.tex = t.rgba
        ? allocRgba(t.width, t.height, null, !!t.linear)
        : allocTexture(t.width, t.height, null);
    rgbaRes = null;
    lost = false;
    // tekstury maja te same id, ale puste dane: wywolujacy wgrywa je ponownie
    device.onContextRestored?.();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  function createPost(): PostPipeline {
    return new PostPipeline(gl, {
      ensureIndices,
      ibo: () => res.ibo,
      texture: (id) => textures.get(id)?.tex,
      isRgba: (id) => !!textures.get(id)?.rgba,
      palette: () => res.paletteTex,
    });
  }

  const device: GfxDevice = {
    get width() {
      return canvas.width;
    },
    get height() {
      return canvas.height;
    },
    get dpr() {
      return dpr;
    },
    stats,
    get contextLost() {
      return lost;
    },
    resize(cssWidth, cssHeight, ratio) {
      dpr = ratio;
      canvas.width = Math.max(1, Math.round(cssWidth * ratio));
      canvas.height = Math.max(1, Math.round(cssHeight * ratio));
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    },
    createIndexedTexture(width, height, data) {
      const tex = allocTexture(width, height, data ?? null);
      const id = nextId++;
      textures.set(id, { tex, width, height });
      const t: IndexedTexture = { id, width, height };
      return t;
    },
    createRgbaTexture(width, height, data, opts) {
      const linear = (opts?.filter ?? 'linear') === 'linear';
      const tex = allocRgba(width, height, data ?? null, linear);
      const id = nextId++;
      textures.set(id, { tex, width, height, rgba: true, linear });
      const t: IndexedTexture = { id, width, height, rgba: true, linear };
      return t;
    },
    deleteTexture(t) {
      const entry = textures.get(t.id);
      if (!entry) return;
      gl.deleteTexture(entry.tex);
      textures.delete(t.id);
      const a = aux.get(t.id);
      if (a?.normal) gl.deleteTexture(a.normal);
      if (a?.depth) gl.deleteTexture(a.depth);
      aux.delete(t.id);
    },
    updateIndexedTexture(t, x, y, w, h, data) {
      const entry = textures.get(t.id);
      if (!entry) throw new Error('Nieznana tekstura');
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.bindTexture(gl.TEXTURE_2D, entry.tex);
      if (entry.rgba) {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          x,
          y,
          w,
          h,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          premultiplyRgba(data),
        );
        return;
      }
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RED, gl.UNSIGNED_BYTE, data);
    },
    setPalette(rgba) {
      if (rgba.length !== 1024) throw new Error('Paleta musi miec 1024 bajty');
      palette = rgba.slice();
      gl.bindTexture(gl.TEXTURE_2D, res.paletteTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    },
    setLighting(state) {
      litState = state;
      if (state?.enabled && !lost) litRes ??= createLitResources();
    },
    setSpriteAux(t, a) {
      const entry = textures.get(t.id);
      if (!entry) throw new Error('Nieznana tekstura');
      const prev = aux.get(t.id);
      if (prev?.normal) gl.deleteTexture(prev.normal);
      if (prev?.depth) gl.deleteTexture(prev.depth);
      aux.set(t.id, {
        normal: a.normal ? allocAux(t.width, t.height, gl.RGBA8, gl.RGBA, a.normal) : null,
        depth: a.depth ? allocAux(t.width, t.height, gl.R8, gl.RED, a.depth) : null,
      });
    },
    setPostProcess(cfg) {
      postCfg = isPostProcessActive(cfg) ? (cfg ?? null) : null;
      if (postCfg && !lost) post ??= createPost();
    },
    beginFrame(clear) {
      stats.drawCalls = 0;
      stats.uploadedBytes = 0;
      stats.fillPixels = 0;
      routed = false;
      if (lost) return;
      const lit = !!litState?.enabled;
      if (postCfg && post && PostPipeline.needsScene(postCfg, lit)) {
        routed = true;
        post.bindScene(canvas.width, canvas.height, !!postCfg.ssao && lit);
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
      if (routed) gl.clearDepth(1);
      gl.clear(routed ? gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT : gl.COLOR_BUFFER_BIT);
    },
    drawSprites(batch: SpriteBatch, camera: Camera2D) {
      if (lost || batch.count === 0) return;
      if (litState?.enabled) {
        litRes ??= createLitResources();
        let mask: WebGLTexture | null = null;
        let pointMask: WebGLTexture | null = null;
        if (postCfg?.shadows && post) {
          mask = post.renderShadowMask(
            batch.groups(),
            camera,
            camera.deviceZoom(dpr),
            canvas.width,
            canvas.height,
            litState.sunDir,
            postCfg.shadows,
            true,
          );
          if (postCfg.shadows.points) {
            pointMask = post.renderPointShadowMask(
              batch.groups(),
              camera,
              camera.deviceZoom(dpr),
              canvas.width,
              canvas.height,
              litState.lightsUbo,
              litState.lightCount,
              postCfg.shadows,
              true,
            );
          }
          // powrot do celu sceny (maska zmienila FBO/viewport)
          gl.bindFramebuffer(gl.FRAMEBUFFER, routed ? post.sceneTarget() : null);
          if (routed) {
            gl.drawBuffers([gl.COLOR_ATTACHMENT0, postCfg.ssao ? gl.COLOR_ATTACHMENT1 : gl.NONE]);
            if (postCfg.ssao) gl.enable(gl.DEPTH_TEST);
          }
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.disable(gl.BLEND);
        }
        drawLit(batch, camera, litState, mask, pointMask);
        return;
      }
      const groups = batch.groups();
      let floats = 0;
      let maxSprites = 0;
      for (const g of groups) {
        floats += g.vertices.length;
        if (g.spriteCount > maxSprites) maxSprites = g.spriteCount;
      }
      gl.useProgram(res.program);
      gl.bindVertexArray(res.vao);
      ensureIndices(maxSprites);
      const zoom = camera.deviceZoom(dpr);
      gl.uniform2f(res.uViewport, canvas.width, canvas.height);
      gl.uniform2f(res.uCenter, camera.x, camera.y);
      // kamera w pikselach CSS; bufor w pikselach urzadzenia
      gl.uniform1f(res.uZoom, zoom);
      gl.uniform1i(res.uIndexed, 0);
      gl.uniform1i(res.uPalette, 1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, res.paletteTex);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.vbo);
      // jedna alokacja na klatke (orphaning: bez synchronizacji z poprzednia klatka), potem podzakresy
      gl.bufferData(gl.ARRAY_BUFFER, floats * 4, gl.DYNAMIC_DRAW);
      let byteOffset = 0;
      // swiatlo: osobny bufor, 1 float na wierzcholek (atrybut 2 jest zwiazany z lbo w VAO)
      let lightFloats = 0;
      for (const g of groups) lightFloats += g.lights.length;
      gl.bindBuffer(gl.ARRAY_BUFFER, res.lbo);
      gl.bufferData(gl.ARRAY_BUFFER, lightFloats * 4, gl.DYNAMIC_DRAW);
      let lightOffset = 0;
      for (const g of groups) {
        gl.bufferSubData(gl.ARRAY_BUFFER, lightOffset, g.lights);
        lightOffset += g.lights.byteLength;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, res.vbo);
      lightOffset = 0;
      let rgbaMode = false;
      for (const g of groups) {
        const entry = textures.get(g.texture.id);
        const myLightOffset = lightOffset;
        lightOffset += g.lights.byteLength;
        if (!entry) continue;
        if (!!entry.rgba !== rgbaMode) {
          rgbaMode = !!entry.rgba;
          if (rgbaMode) {
            const R = (rgbaRes ??= createRgbaResources());
            gl.useProgram(R.program);
            gl.uniform2f(R.uViewport, canvas.width, canvas.height);
            gl.uniform2f(R.uCenter, camera.x, camera.y);
            gl.uniform1f(R.uZoom, zoom);
            gl.uniform1i(R.uIndexed, 0);
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.FUNC_ADD);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          } else {
            gl.useProgram(res.program);
            gl.disable(gl.BLEND);
          }
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, byteOffset, g.vertices);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, byteOffset);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, byteOffset + 8);
        gl.bindBuffer(gl.ARRAY_BUFFER, res.lbo);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 4, myLightOffset);
        gl.bindBuffer(gl.ARRAY_BUFFER, res.vbo);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, entry.tex);
        gl.drawElements(gl.TRIANGLES, g.spriteCount * 6, gl.UNSIGNED_INT, 0);
        byteOffset += g.vertices.byteLength;
        stats.drawCalls++;
        stats.uploadedBytes += g.vertices.byteLength;
        stats.fillPixels += g.area * zoom * zoom;
      }
      if (rgbaMode) gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    },
    endFrame() {
      if (lost) return;
      if (routed && post && postCfg) {
        post.finish(postCfg, !!litState?.enabled, canvas.width, canvas.height);
        routed = false;
      }
      gl.flush();
    },
    readPixels() {
      const out = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return out;
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      for (const t of textures.values()) gl.deleteTexture(t.tex);
      textures.clear();
      for (const a of aux.values()) {
        if (a.normal) gl.deleteTexture(a.normal);
        if (a.depth) gl.deleteTexture(a.depth);
      }
      aux.clear();
      post?.dispose();
      post = null;
      if (litRes) {
        gl.deleteProgram(litRes.program);
        gl.deleteVertexArray(litRes.vao);
        gl.deleteBuffer(litRes.layerBo);
        gl.deleteBuffer(litRes.ubo);
        for (const t of [
          litRes.lightMapTex,
          litRes.flatNormalTex,
          litRes.zeroDepthTex,
          litRes.whiteTex,
        ])
          gl.deleteTexture(t);
        litRes = null;
      }
      if (rgbaRes) gl.deleteProgram(rgbaRes.program);
      rgbaRes = null;
      gl.deleteTexture(res.paletteTex);
      gl.deleteBuffer(res.vbo);
      gl.deleteBuffer(res.lbo);
      gl.deleteBuffer(res.ibo);
      gl.deleteVertexArray(res.vao);
      gl.deleteProgram(res.program);
    },
  };
  return device;
}
