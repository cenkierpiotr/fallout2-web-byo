import { hexToWorld, type GameMap, type GameObject } from '@f2/engine-core';
import type { IsoCamera } from './iso-camera.js';
import type { LightMap } from './light-map.js';
import type { IndexedTexture } from './gfx-device.js';
import type { SpriteBatch } from './sprite-batch.js';
import { sortForDraw } from './draw-order.js';
import { worldMetrics } from './hd-override.js';

/** Klatka obiektu (podzbior SpriteFrameRef + przesuniecie kierunku z FRM). */
export interface ObjectFrame {
  texture: IndexedTexture;
  sx: number;
  sy: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  shiftX: number;
  shiftY: number;
  /** Skala tekstury wzgledem swiata (HD = 4, domyslnie 1); width/height/offset w pikselach tekstury. */
  scale?: number;
}

/** Zrodlo sprite'ow obiektow (pakiet assets zalezy od render, wiec kontrakt jest tu). */
export interface ObjectSpriteSource {
  /** undefined pomija obiekt (brak FRM). */
  frameFor(obj: GameObject): ObjectFrame | undefined;
}

const FLAG_HIDDEN = 0x1;
const MARGIN = 160;
/** Warstwa glebi obiektow dla parallaxu 2.5D (kafle 0, obiekty 0.5, dachy 1). */
const OBJECT_LAYER = 0.5;

/** Policzone raz na klatke pozycja i metryki widocznego obiektu; `shift` to FrameShift dla draw-order. */
interface Entry {
  f: ObjectFrame;
  x: number;
  y: number;
  w: number;
  h: number;
  shift: { x: number; y: number };
}

export class ObjectLayer {
  private readonly entries = new Map<GameObject, Entry>();
  private readonly visible: GameObject[] = [];

  constructor(
    private readonly assets: ObjectSpriteSource,
    private readonly batch: SpriteBatch,
  ) {}

  /**
   * Rysuje obiekty poziomu w kolejnosci render-order.md. `highlight` (obrys) i emisja swiatla
   * w shaderze: M3 (SpriteInstance.light niesie intensywnosc z LightMap).
   */
  draw(
    map: GameMap,
    elevation: number,
    cam: IsoCamera,
    light: LightMap,
    opts: { player: GameObject; highlight?: GameObject },
  ): void {
    void opts;
    const r = cam.visibleWorldRect();
    const entries = this.entries;
    entries.clear();
    const visible = this.visible;
    visible.length = 0;
    for (const o of map.objects) {
      if (o.elevation !== elevation || o.hex < 0) continue;
      if ((o.flags & FLAG_HIDDEN) !== 0 || o.hidden) continue;
      const f = this.assets.frameFor(o);
      if (!f) continue;
      const p = hexToWorld(o.hex);
      const m = worldMetrics(f);
      const x = p.x + m.shiftX + m.offsetX - Math.floor(m.width / 2);
      const y = p.y + m.shiftY + m.offsetY - m.height;
      if (x + m.width < r.x0 - MARGIN || x > r.x1 + MARGIN) continue;
      if (y + m.height < r.y0 - MARGIN || y > r.y1 + MARGIN) continue;
      entries.set(o, { f, x, y, w: m.width, h: m.height, shift: { x: m.shiftX, y: m.shiftY } });
      visible.push(o);
    }
    this.batch.currentLayer = OBJECT_LAYER;
    for (const o of sortForDraw(visible, (obj) => entries.get(obj)?.shift)) {
      const e = entries.get(o) as Entry;
      this.batch.pushRect(
        e.f.texture,
        e.f.sx,
        e.f.sy,
        e.f.width,
        e.f.height,
        e.x,
        e.y,
        e.w,
        e.h,
        light.intensityAt(o.hex),
      );
    }
  }
}
