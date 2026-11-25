import type { Camera2D } from './camera.js';
import type { SpriteBatch } from './sprite-batch.js';
import type { LitFrameState } from './lighting/types.js';
import type { PostProcessConfig } from './postprocess.js';

export interface IndexedTexture {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  /** Tekstura RGBA (HD, premultiplied alpha w GPU) zamiast indeksowanej R8 + paleta. */
  readonly rgba?: boolean;
  /** Filtr liniowy (tylko RGBA): SpriteBatch cofa UV o pol teksela, zeby atlas nie przeciekal. */
  readonly linear?: boolean;
}

/** Liczniki ostatniej klatki (zerowane w beginFrame); do profilowania i benchmarku. */
export interface DeviceFrameStats {
  drawCalls: number;
  /** Bajty wierzcholkow wyslane do GPU w tej klatce. */
  uploadedBytes: number;
  /** Suma pol sprite'ow w pikselach urzadzenia (oszacowanie fill-rate/overdraw). */
  fillPixels: number;
}

/**
 * Kontrakt DPR: `width`/`height` to rozmiar bufora w pikselach URZADZENIA
 * (css * dpr). Kamera, `worldToScreen`/`screenToWorld` i wskazniki/dotyk dzialaja
 * w pikselach CSS; urzadzenie mnoży zoom kamery przez `dpr` (Camera2D.deviceZoom).
 */
export interface GfxDevice {
  readonly width: number;
  readonly height: number;
  /** Ostatnio ustawiony dpr (domyslnie 1). */
  readonly dpr: number;
  /** Liczniki ostatniej klatki (opcjonalne: atrapy w testach moga je pominac). */
  readonly stats?: DeviceFrameStats;
  /** True miedzy webglcontextlost a webglcontextrestored; rysowanie jest wtedy pomijane. */
  readonly contextLost: boolean;
  /** Wywolywane po utracie kontekstu GL. */
  onContextLost?: () => void;
  /**
   * Wywolywane po odtworzeniu kontekstu. Shader, paleta i tekstury (te same id,
   * ale PUSTE) sa odtworzone; wywolujacy musi ponownie wgrac dane tekstur
   * (updateIndexedTexture).
   */
  onContextRestored?: () => void;
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  createIndexedTexture(width: number, height: number, data?: Uint8Array): IndexedTexture;
  updateIndexedTexture(
    t: IndexedTexture,
    x: number,
    y: number,
    w: number,
    h: number,
    data: Uint8Array,
  ): void;
  /**
   * Sciezka RGBA (HD, za flaga): tekstura w prostym (straight) RGBA, w GPU przechowywana jako
   * premultiplied; sprite'y z niej sa rysowane z blendem alfa (bez obwodki) w kolejnosci batcha.
   * Filtr domyslnie liniowy. Po utracie kontekstu wgrywa sie ponownie przez updateIndexedTexture.
   * Brak metody = urzadzenie bez HD (klasyczny render).
   */
  createRgbaTexture?(
    width: number,
    height: number,
    data?: Uint8Array,
    opts?: { filter?: 'linear' | 'nearest' },
  ): IndexedTexture;
  /** Zwalnia teksture (np. wyparty atlas HD). */
  deleteTexture?(t: IndexedTexture): void;
  setPalette(rgba: Uint8Array): void;
  /**
   * Oswietlenie 2.5D (M9). null albo `enabled: false` = klasyczny render, identyczny jak bez tej
   * metody. Shader oswietlenia kompiluje sie dopiero przy pierwszym wlaczeniu.
   */
  setLighting?(state: LitFrameState | null): void;
  /**
   * Normal map (RGBA, w*h*4) i/lub depth (R8, w*h) dla tekstury; rozmiar jak `t`. Bez nich sprite
   * dostaje plaska normalna (0,0,1) i glebokosc 0. Po utracie kontekstu trzeba wgrac ponownie.
   */
  setSpriteAux?(t: IndexedTexture, aux: { normal?: Uint8Array; depth?: Uint8Array }): void;
  /**
   * Petla passow (cienie sloneczne, SSAO, color grading, PostFx). null albo konfiguracja bez
   * aktywnych passow = klasyczny render, bajt w bajt. Cienie i SSAO wymagaja setLighting(enabled).
   */
  setPostProcess?(cfg: PostProcessConfig | null): void;
  beginFrame(clear: [number, number, number, number]): void;
  drawSprites(batch: SpriteBatch, camera: Camera2D): void;
  endFrame(): void;
  readPixels(): Uint8Array;
  dispose(): void;
}
