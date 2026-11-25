import { hexToWorld } from '@f2/engine-core';
export { LIGHT_FIELD_TRANSFORM } from './light-field-transform.js';
import { MAX_POINT_LIGHTS, type HexRect, type MapLightSource, type PointLight } from './types.js';

/**
 * Lightmapa per hex jako tekstura RGB (200x200x3), pod shader 2.5D (zadanie 28).
 * Osobna od klasycznego `LightMap` (Float32, jasnosc kafli): ta niesie kolor i lista swiatel.
 * Odleglosc liczona euklidesowo w kolumnach/wierszach siatki (uproszczenie, Z).
 */
export class LightField {
  readonly width: number;
  readonly height: number;
  readonly texture: Uint8Array;
  private readonly prev: Uint8Array;
  private sources: MapLightSource[] = [];
  private isDirty = true;
  private first = true;
  private ver = 0;

  /** Rosnie przy kazdej zmianie tekstury (konsument GPU wgrywa ja ponownie, gdy wersja sie zmieni). */
  get version(): number {
    return this.ver;
  }

  constructor(w = 200, h = 200) {
    this.width = w;
    this.height = h;
    this.texture = new Uint8Array(w * h * 3);
    this.prev = new Uint8Array(w * h * 3);
  }

  /** True gdy zawartosc tekstury zmienila sie od ostatniego `markClean` / porownania. */
  get dirty(): boolean {
    return this.isDirty;
  }

  markClean(): void {
    this.isDirty = false;
  }

  update(sources: readonly MapLightSource[], ambient: number, elevation: number): void {
    const { width: w, height: h, texture: data } = this;
    this.prev.set(data);
    const base = Math.round(Math.min(1, Math.max(0, ambient)) * 255);
    data.fill(base);
    const active: MapLightSource[] = [];
    for (const s of sources) {
      if (s.elevation !== elevation || !(s.intensity > 0) || !(s.radius > 0)) continue;
      if (!Number.isInteger(s.hex) || s.hex < 0 || s.hex >= w * h) continue;
      active.push({ ...s });
      const inten = s.intensity / 65536;
      const col = s.color ?? [255, 255, 255];
      const cx = s.hex % w;
      const cy = Math.floor(s.hex / w);
      const r = Math.ceil(s.radius);
      for (let dy = -r; dy <= r; dy++) {
        const y = cy + dy;
        if (y < 0 || y >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx;
          if (x < 0 || x >= w) continue;
          const d = Math.hypot(dx, dy);
          if (d >= s.radius && d > 0) continue;
          const k = d === 0 ? inten : inten * (1 - d / s.radius);
          const i = (y * w + x) * 3;
          for (let c = 0; c < 3; c++) {
            data[i + c] = Math.min(255, (data[i + c] ?? 0) + Math.round(k * (col[c] ?? 255)));
          }
        }
      }
    }
    this.sources = active;
    let changed = this.first;
    if (!changed) {
      for (let i = 0; i < data.length; i++) {
        if (data[i] !== this.prev[i]) {
          changed = true;
          break;
        }
      }
    }
    this.first = false;
    // dirty zostaje true, dopoki konsument nie wywola markClean (zmiana nie moze zginac)
    if (changed) {
      this.isDirty = true;
      this.ver++;
    }
  }

  /** Do `max` swiatel z viewportu (+ promien), najblizszych jego srodka; remis: nizszy hex. */
  pointLights(viewport: HexRect, max: number = MAX_POINT_LIGHTS): PointLight[] {
    if (max <= 0) return [];
    const cxv = (viewport.x0 + viewport.x1) / 2;
    const cyv = (viewport.y0 + viewport.y1) / 2;
    const cand: { d: number; hex: number; light: PointLight }[] = [];
    for (const s of this.sources) {
      const x = s.hex % this.width;
      const y = Math.floor(s.hex / this.width);
      if (x < viewport.x0 - s.radius || x > viewport.x1 + s.radius) continue;
      if (y < viewport.y0 - s.radius || y > viewport.y1 + s.radius) continue;
      const wp = hexToWorld(s.hex);
      const col = s.color ?? [255, 255, 255];
      cand.push({
        d: Math.hypot(x - cxv, y - cyv),
        hex: s.hex,
        light: {
          x: wp.x,
          y: wp.y,
          z: 0.3,
          color: [col[0] / 255, col[1] / 255, col[2] / 255],
          radius: s.radius * 16,
          intensity: s.intensity / 65536,
        },
      });
    }
    cand.sort((a, b) => a.d - b.d || a.hex - b.hex);
    return cand.slice(0, max).map((c) => c.light);
  }
}
