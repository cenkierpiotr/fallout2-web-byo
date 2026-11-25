import type { IndexedTexture } from './gfx-device.js';

export interface SpriteInstance {
  texture: IndexedTexture;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  x: number;
  y: number;
  /** Rozmiar na ekranie w jednostkach swiata (domyslnie sw/sh); HD: sw/scale. */
  dw?: number;
  dh?: number;
  /** Intensywnosc swiatla 0..1 (mnoznik jasnosci w shaderze); domyslnie 1. */
  light?: number;
}

/** Floaty na wierzcholek: x, y, u, v. */
export const FLOATS_PER_VERTEX = 4;
/** Wierzcholki na sprite (quad indeksowany: 0,1,2 i 2,1,3). */
export const VERTS_PER_SPRITE = 4;
export const FLOATS_PER_SPRITE = FLOATS_PER_VERTEX * VERTS_PER_SPRITE;

export interface SpriteGroup {
  texture: IndexedTexture;
  /** 4 wierzcholki x [x,y,u,v] na sprite: (x0,y0) (x1,y0) (x0,y1) (x1,y1). Widok na bufor wielokrotnego uzytku. */
  vertices: Float32Array;
  /** Swiatlo 0..1, po jednym floacie na wierzcholek (4 na sprite), rownolegle do `vertices`. */
  lights: Float32Array;
  spriteCount: number;
  /** Warstwa glebi 0..1 po jednym floacie na wierzcholek (parallax 2.5D), rownolegle do `vertices`. */
  layers: Float32Array;
  /** Suma pol sprite'ow w jednostkach swiata (do oszacowania fill-rate). */
  area: number;
}

interface Slot {
  texture: IndexedTexture;
  data: Float32Array;
  lights: Float32Array;
  layers: Float32Array;
  count: number;
  area: number;
}

const INITIAL_SPRITES = 256;

/** Klatka batcha w postaci przenoszonej do workera (renderWorker E3): bufory + tekstury po id. */
export interface TransferableBatch {
  ordered: boolean;
  groups: {
    textureId: number;
    spriteCount: number;
    area: number;
    vertices: Float32Array;
    lights: Float32Array;
    layers: Float32Array;
  }[];
}

/** Minimalny widok tekstury do odtworzenia batcha po stronie workera (rozmiary z lustra tekstur). */
export type TextureLookup = (id: number) => IndexedTexture;

/**
 * Zbiera sprite'y klatki pogrupowane po teksturze (kolejnosc pierwszego wystapienia).
 * Bufory wierzcholkow sa trzymane miedzy klatkami (zero alokacji w stanie ustalonym).
 */
export class SpriteBatch {
  private readonly slots = new Map<number, Slot>();
  private readonly active: Slot[] = [];
  private total = 0;
  private lastId = -1;
  private last: Slot | null = null;
  /**
   * Warstwa glebi dla kolejnych push (0 kafle, 0.5 obiekty, 1 dachy); czytana tylko przez sciezke
   * oswietlenia 2.5D (parallax). Warstwy ustawiaja ja na czas rysowania i przywracaja 0.5.
   */
  currentLayer = 0.5;
  /**
   * Tryb kolejnosciowy (sciezka HD RGBA, domyslnie false): zamiast laczyc sprite'y po teksturze,
   * grupy sa seriami kolejnych sprite'ow z tej samej tekstury, wiec kolejnosc rysowania zostaje
   * zachowana miedzy teksturami indeksowanymi i RGBA. Ustawiac przed pierwszym push klatki.
   */
  ordered = false;
  private pool: Slot[] = [];
  private poolUsed = 0;

  get count(): number {
    return this.total;
  }

  push(s: SpriteInstance): void {
    this.pushRect(s.texture, s.sx, s.sy, s.sw, s.sh, s.x, s.y, s.dw ?? s.sw, s.dh ?? s.sh, s.light);
  }

  /** Jak `push`, ale bez alokacji obiektu (sciezka goraca: kafle, obiekty). */
  pushRect(
    texture: IndexedTexture,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    x: number,
    y: number,
    dw: number,
    dh: number,
    light = 1,
  ): void {
    let slot: Slot | null = this.lastId === texture.id ? this.last : null;
    if (this.ordered) {
      if (!slot) {
        slot = this.pool[this.poolUsed] ?? null;
        if (!slot) {
          slot = {
            texture,
            data: new Float32Array(INITIAL_SPRITES * FLOATS_PER_SPRITE),
            lights: new Float32Array(INITIAL_SPRITES * VERTS_PER_SPRITE),
            layers: new Float32Array(INITIAL_SPRITES * VERTS_PER_SPRITE),
            count: 0,
            area: 0,
          };
          this.pool.push(slot);
        }
        this.poolUsed++;
        slot.texture = texture;
        slot.count = 0;
        slot.area = 0;
        this.lastId = texture.id;
        this.last = slot;
      }
    } else if (!slot) {
      slot = this.slots.get(texture.id) ?? null;
      if (!slot) {
        slot = {
          texture,
          data: new Float32Array(INITIAL_SPRITES * FLOATS_PER_SPRITE),
          lights: new Float32Array(INITIAL_SPRITES * VERTS_PER_SPRITE),
          layers: new Float32Array(INITIAL_SPRITES * VERTS_PER_SPRITE),
          count: 0,
          area: 0,
        };
        this.slots.set(texture.id, slot);
      }
      this.lastId = texture.id;
      this.last = slot;
    }
    if (slot.count === 0) this.active.push(slot);
    let d = slot.data;
    const o = slot.count * FLOATS_PER_SPRITE;
    if (o + FLOATS_PER_SPRITE > d.length) {
      const bigger = new Float32Array(d.length * 2);
      bigger.set(d);
      slot.data = d = bigger;
      const biggerL = new Float32Array(slot.lights.length * 2);
      biggerL.set(slot.lights);
      slot.lights = biggerL;
      const biggerY = new Float32Array(slot.layers.length * 2);
      biggerY.set(slot.layers);
      slot.layers = biggerY;
    }
    const lo = slot.count * VERTS_PER_SPRITE;
    slot.lights[lo] = light;
    slot.lights[lo + 1] = light;
    slot.lights[lo + 2] = light;
    slot.lights[lo + 3] = light;
    const layer = this.currentLayer;
    slot.layers[lo] = layer;
    slot.layers[lo + 1] = layer;
    slot.layers[lo + 2] = layer;
    slot.layers[lo + 3] = layer;
    // filtr liniowy: pol teksela do wewnatrz, zeby sasiednie sprite'y atlasu nie przeciekaly
    const ins = texture.linear ? 0.5 : 0;
    const u0 = (sx + ins) / texture.width;
    const v0 = (sy + ins) / texture.height;
    const u1 = (sx + sw - ins) / texture.width;
    const v1 = (sy + sh - ins) / texture.height;
    const x1 = x + dw;
    const y1 = y + dh;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = u0;
    d[o + 3] = v0;
    d[o + 4] = x1;
    d[o + 5] = y;
    d[o + 6] = u1;
    d[o + 7] = v0;
    d[o + 8] = x;
    d[o + 9] = y1;
    d[o + 10] = u0;
    d[o + 11] = v1;
    d[o + 12] = x1;
    d[o + 13] = y1;
    d[o + 14] = u1;
    d[o + 15] = v1;
    slot.count++;
    slot.area += dw * dh;
    this.total++;
  }

  clear(): void {
    this.poolUsed = 0;
    this.lastId = -1;
    this.last = null;
    for (const s of this.active) {
      s.count = 0;
      s.area = 0;
    }
    this.active.length = 0;
    this.total = 0;
  }

  /** Grupy w kolejnosci pierwszego wystapienia tekstury (widoki na bufory wewnetrzne, wazne do nastepnego push/clear). */
  groups(): SpriteGroup[] {
    return this.active.map((s) => ({
      texture: s.texture,
      vertices: s.data.subarray(0, s.count * FLOATS_PER_SPRITE),
      lights: s.lights.subarray(0, s.count * VERTS_PER_SPRITE),
      layers: s.layers.subarray(0, s.count * VERTS_PER_SPRITE),
      spriteCount: s.count,
      area: s.area,
    }));
  }

  /**
   * Kopia klatki gotowa do `postMessage` z transferem (`transferList` zwraca bufory). Bufory
   * wewnetrzne zostaja w batchu (wielokrotnego uzytku), przenosimy kopie skrocone do `spriteCount`.
   */
  toTransferable(): TransferableBatch {
    return {
      ordered: this.ordered,
      groups: this.active.map((s) => ({
        textureId: s.texture.id,
        spriteCount: s.count,
        area: s.area,
        vertices: s.data.slice(0, s.count * FLOATS_PER_SPRITE),
        lights: s.lights.slice(0, s.count * VERTS_PER_SPRITE),
        layers: s.layers.slice(0, s.count * VERTS_PER_SPRITE),
      })),
    };
  }

  static transferList(t: TransferableBatch): ArrayBuffer[] {
    return t.groups.flatMap((g) => [
      g.vertices.buffer,
      g.lights.buffer,
      g.layers.buffer,
    ]) as ArrayBuffer[];
  }

  /** Odtwarza grupy (jak `groups()`) po stronie workera; tekstury z lustra po id. */
  static groupsFrom(t: TransferableBatch, lookup: TextureLookup): SpriteGroup[] {
    return t.groups.map((g) => ({
      texture: lookup(g.textureId),
      vertices: g.vertices,
      lights: g.lights,
      layers: g.layers,
      spriteCount: g.spriteCount,
      area: g.area,
    }));
  }
}
