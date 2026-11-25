import { TILE_GRID, tileIndexToWorld } from '@f2/engine-core';
import type { IsoCamera } from './iso-camera.js';
import type { IndexedTexture } from './gfx-device.js';
import type { SpriteBatch } from './sprite-batch.js';
import type { TileBand } from './tile-trim.js';

/** Minimalne zrodlo kafli (zgodne strukturalnie z MapTiles z @f2/formats): 10000 wpisow, y*100+x. */
export interface TileSource {
  floor: ArrayLike<number>;
  roof: ArrayLike<number>;
}

/** Klatka kafla w atlasie (podzbior SpriteFrameRef). */
export interface TileFrame {
  texture: IndexedTexture;
  sx: number;
  sy: number;
  width: number;
  height: number;
  /** Ciasne pasma nieprzezroczystych pikseli (computeTileBands); brak = caly prostokat. */
  bands?: readonly TileBand[];
  /** Skala tekstury wzgledem swiata (HD = 4, domyslnie 1); width/height w pikselach tekstury. */
  scale?: number;
}

const TILE_W = 80;
const TILE_H = 36;
const ROOF_DY = -96;
const MARGIN_X = 80;
const MARGIN_Y = 36;
/** Warstwy glebi dla parallaxu 2.5D (czytane tylko przy wlaczonym oswietleniu): kafle 0, obiekty 0.5, dachy 1. */
const FLOOR_LAYER = 0;
const ROOF_LAYER = 1;
const DEFAULT_LAYER = 0.5;

/**
 * Podloga i dach. Wspolrzedne w swiecie (kamera dziala w urzadzeniu przy drawSprites);
 * IsoCamera sluzy tylko do cullingu. Kafle w kolejnosci wierszy (ty, potem tx).
 */
export class TileLayer {
  private tiles: TileSource | null = null;
  private frameFor: (tileIndex: number) => TileFrame | undefined = () => undefined;
  private readonly px = new Float32Array(TILE_GRID * TILE_GRID);
  private readonly py = new Float32Array(TILE_GRID * TILE_GRID);

  constructor(private readonly batch: SpriteBatch) {
    for (let i = 0; i < TILE_GRID * TILE_GRID; i++) {
      const p = tileIndexToWorld(i);
      this.px[i] = p.x;
      this.py[i] = p.y;
    }
  }

  /** `frameForTile(indeks z tiles.lst)`: undefined pomija kafel (np. pusty dach, indeks 1). */
  setTiles(tiles: TileSource, frameForTile: (tileIndex: number) => TileFrame | undefined): void {
    this.tiles = tiles;
    this.frameFor = frameForTile;
  }

  /** `lightAt(tileIndex)` 0..1: jasnosc kafla (LightMap.intensityAtTile); brak = 1 (bez oswietlenia). */
  drawFloor(cam: IsoCamera, lightAt?: (tileIndex: number) => number): void {
    if (!this.tiles) return;
    this.batch.currentLayer = FLOOR_LAYER;
    try {
      this.draw(cam, this.tiles.floor, 0, () => 1, lightAt);
    } finally {
      this.batch.currentLayer = DEFAULT_LAYER;
    }
  }

  /** alpha 0 pomija kafel; czesciowa przezroczystosc wymaga tintu w SpriteBatch (poza zakresem). */
  drawRoof(
    cam: IsoCamera,
    alphaForTile: (i: number) => number,
    lightAt?: (tileIndex: number) => number,
  ): void {
    if (!this.tiles) return;
    this.batch.currentLayer = ROOF_LAYER;
    try {
      this.draw(cam, this.tiles.roof, ROOF_DY, alphaForTile, lightAt);
    } finally {
      this.batch.currentLayer = DEFAULT_LAYER;
    }
  }

  private draw(
    cam: IsoCamera,
    src: ArrayLike<number>,
    dy: number,
    alpha: (i: number) => number,
    lightAt?: (tileIndex: number) => number,
  ): void {
    const r = cam.visibleWorldRect();
    const x0 = r.x0 - MARGIN_X;
    const x1 = r.x1 + MARGIN_X;
    const y0 = r.y0 - MARGIN_Y;
    const y1 = r.y1 + MARGIN_Y;
    for (let i = 0; i < TILE_GRID * TILE_GRID; i++) {
      const x = this.px[i] as number;
      const y = (this.py[i] as number) + dy;
      if (x + TILE_W < x0 || x > x1 || y + TILE_H < y0 || y > y1) continue;
      const f = this.frameFor(src[i] as number);
      if (!f) continue;
      if (alpha(i) <= 0) continue;
      const light = lightAt ? lightAt(i) : 1;
      if (f.scale && f.scale > 1) {
        // HD: kafel w jednostkach swiata = rozmiar tekstury / skala (bez ciec pasmowych)
        this.batch.pushRect(
          f.texture,
          f.sx,
          f.sy,
          f.width,
          f.height,
          x,
          y,
          f.width / f.scale,
          f.height / f.scale,
          light,
        );
        continue;
      }
      if (f.bands) {
        for (const b of f.bands) {
          this.batch.pushRect(
            f.texture,
            f.sx + b.x0,
            f.sy + b.y0,
            b.x1 - b.x0,
            b.y1 - b.y0,
            x + b.x0,
            y + b.y0,
            b.x1 - b.x0,
            b.y1 - b.y0,
            light,
          );
        }
        continue;
      }
      this.batch.pushRect(f.texture, f.sx, f.sy, f.width, f.height, x, y, f.width, f.height, light);
    }
  }
}
