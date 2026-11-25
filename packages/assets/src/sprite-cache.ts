import type { Frm } from '@f2/formats';
import { computeTileBands, type GfxDevice, type IndexedTexture, type TileBand } from '@f2/render';
import { ShelfPacker } from './atlas.js';

export interface SpriteFrameRef {
  texture: IndexedTexture;
  sx: number;
  sy: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  /** Skala tekstury wzgledem swiata (HD = 4); brak = 1. width/height/offset w pikselach tekstury. */
  scale?: number;
  /** Tylko kafle (art/tiles/) przy `tileBands`: ciasne pasma nieprzezroczystych pikseli (mniej overdrawu). */
  bands?: readonly TileBand[];
}

export interface SpriteHandle {
  fps: number;
  actionFrame: number;
  framesPerDirection: number;
  directions: SpriteFrameRef[][];
  shiftX: Int16Array;
  shiftY: Int16Array;
}

interface Page {
  texture: IndexedTexture;
  packer: ShelfPacker;
}

export class SpriteCache {
  private readonly handles = new Map<string, Promise<SpriteHandle>>();
  private readonly atlasPages: Page[] = [];

  constructor(
    private readonly device: GfxDevice,
    private readonly loadFrm: (path: string) => Promise<Frm>,
    private readonly pageSize = 2048,
    /** Liczba pasm ciecia kafli podlogi (0 = wylaczone). */
    private readonly tileBands = 0,
  ) {}

  get pages(): number {
    return this.atlasPages.length;
  }

  get(path: string): Promise<SpriteHandle> {
    let p = this.handles.get(path);
    if (!p) {
      p = this.loadFrm(path).then((frm) => this.build(frm, path));
      this.handles.set(path, p);
      p.catch(() => this.handles.delete(path));
    }
    return p;
  }

  private build(frm: Frm, path: string): SpriteHandle {
    const trim = this.tileBands > 0 && /^art[\\/]tiles[\\/]/i.test(path);
    const directions = frm.directions.map((frames) =>
      frames.map((f): SpriteFrameRef => {
        const place = this.place(f.width, f.height);
        if (f.width > 0 && f.height > 0) {
          this.device.updateIndexedTexture(
            place.texture,
            place.x,
            place.y,
            f.width,
            f.height,
            f.pixels,
          );
        }
        return {
          texture: place.texture,
          sx: place.x,
          sy: place.y,
          width: f.width,
          height: f.height,
          offsetX: f.offsetX,
          offsetY: f.offsetY,
          ...(trim && f.width > 0 && f.height > 0
            ? { bands: computeTileBands(f.pixels, f.width, f.height, this.tileBands) }
            : {}),
        };
      }),
    );
    return {
      fps: frm.fps,
      actionFrame: frm.actionFrame,
      framesPerDirection: frm.framesPerDirection,
      directions,
      shiftX: frm.shiftX,
      shiftY: frm.shiftY,
    };
  }

  private place(w: number, h: number): { texture: IndexedTexture; x: number; y: number } {
    if (w > this.pageSize || h > this.pageSize) {
      // klatka wieksza niz strona: osobna tekstura, nie liczy sie do pages
      return {
        texture: this.device.createIndexedTexture(Math.max(w, 1), Math.max(h, 1)),
        x: 0,
        y: 0,
      };
    }
    const last = this.atlasPages[this.atlasPages.length - 1];
    const pos = last?.packer.insert(w, h);
    if (last && pos) return { texture: last.texture, ...pos };
    const page: Page = {
      texture: this.device.createIndexedTexture(this.pageSize, this.pageSize),
      packer: new ShelfPacker(this.pageSize, this.pageSize),
    };
    this.atlasPages.push(page);
    const first = page.packer.insert(w, h);
    if (!first) throw new Error('atlas: nie mozna umiescic klatki na pustej stronie');
    return { texture: page.texture, ...first };
  }
}
