import { hexToWorld, tileIndexToWorld, worldToHex, type Hex } from '@f2/engine-core';

export interface WorldRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function computeMapBounds(): WorldRect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const i of [0, 99, 9900, 9999]) {
    const p = tileIndexToWorld(i);
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x + 80);
    y1 = Math.max(y1, p.y + 36);
  }
  return { x0, y0, x1, y1 };
}

/** Obrys swiata mapy (kafle 80x36, podloga). */
export const MAP_BOUNDS: WorldRect = computeMapBounds();

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

/**
 * Kamera izometryczna. (x, y) = punkt swiata w srodku widoku. Dziala w pikselach CSS
 * (kontrakt DPR z gfx-device.ts); `dpr` jest tylko przechowywany dla urzadzenia.
 */
export class IsoCamera {
  x = 0;
  y = 0;
  zoom = 1;
  viewportW = 640;
  viewportH = 480;
  dpr = 1;
  /**
   * Wspolczynnik parallaxu 2.5D (ADR-0011, domyslnie 0 = wylaczony, render klasyczny). Gdy > 0,
   * urzadzenie przesuwa warstwy o `parallaxDelta() * (warstwa - 0.5) * parallaxFactor`.
   */
  parallaxFactor = 0;
  private anchorX = 0;
  private anchorY = 0;

  /** Zapamietuje biezaca pozycje jako punkt zerowy parallaxu (np. po wejsciu na mape). */
  resetParallaxAnchor(): void {
    this.anchorX = this.x;
    this.anchorY = this.y;
  }

  /** Przesuniecie kamery od punktu zerowego (px swiata); 0,0 gdy parallax wylaczony. */
  parallaxDelta(): [number, number] {
    if (!(this.parallaxFactor > 0)) return [0, 0];
    return [this.x - this.anchorX, this.y - this.anchorY];
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + this.viewportW / 2,
      y: (wy - this.y) * this.zoom + this.viewportH / 2,
    };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.viewportW / 2) / this.zoom + this.x,
      y: (sy - this.viewportH / 2) / this.zoom + this.y,
    };
  }

  /** Heks pod punktem ekranu lub -1 (poza siatka). */
  screenToHex(sx: number, sy: number): Hex | -1 {
    const w = this.screenToWorld(sx, sy);
    return worldToHex(w.x, w.y);
  }

  visibleWorldRect(): WorldRect {
    const hw = this.viewportW / (2 * this.zoom);
    const hh = this.viewportH / (2 * this.zoom);
    return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh };
  }

  centerOnHex(h: Hex): void {
    const p = hexToWorld(h);
    this.x = p.x;
    this.y = p.y;
  }

  /** Przesuniecie o (dx, dy) pikseli ekranu (tresc podaza za palcem/kursorem). */
  pan(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  /** Zoom o `factor` z zachowaniem punktu swiata pod (sx, sy). */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  /** Widok nie wychodzi poza MAP_BOUNDS; gdy jest wiekszy niz mapa w osi, srodkuje. */
  clampToMap(): void {
    const b = MAP_BOUNDS;
    const vw = this.viewportW / this.zoom;
    const vh = this.viewportH / this.zoom;
    this.x = clampAxis(this.x, vw, b.x0, b.x1);
    this.y = clampAxis(this.y, vh, b.y0, b.y1);
  }
}

function clampAxis(c: number, view: number, lo: number, hi: number): number {
  if (view >= hi - lo) return (lo + hi) / 2;
  const half = view / 2;
  return Math.min(hi - half, Math.max(lo + half, c));
}
