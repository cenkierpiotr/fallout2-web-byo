import { selectSprite, type HdOverride, type SpriteCache, type SpriteHandle } from '@f2/assets';
import type { GameObject } from '@f2/engine-core';
import type { ObjectFrame, ObjectSpriteSource, TileFrame } from '@f2/render';
import type { FidResolver } from './fid-path';

export interface ObjectSprite {
  fid: number;
  frame: number;
}

/**
 * Synchroniczny dostep do sprite'ow dla warstw renderu (ObjectSpriteSource, TileLayer).
 * Wszystko, co mapa pokazuje, jest ladowane z gory (`preload`); to, czego jeszcze nie ma
 * (np. nowa animacja gracza), jest ladowane w tle, a do tego czasu obiekt jest pomijany.
 */
/** Opcjonalne nadpisanie HD (sciezka RGBA, za flaga): bez niego biblioteka dziala jak dotad. */
export interface SpriteLibraryHd {
  override: HdOverride;
  /** false: kafle (art/tiles) zostaja oryginalne, HD tylko dla obiektow/scenerii/krytterow. */
  tiles: boolean;
}

const TILE_PATH = /^art\/tiles\//;

export class SpriteLibrary implements ObjectSpriteSource {
  private readonly handles = new Map<string, SpriteHandle>();
  private readonly loading = new Map<string, Promise<void>>();
  readonly failed = new Set<string>();
  private readonly tileFrames = new Map<number, TileFrame>();

  constructor(
    private readonly cache: SpriteCache,
    private readonly fids: FidResolver,
    /** Zwraca fid i klatke do pokazania dla obiektu (gracz ma animacje chodu). */
    private readonly spriteOf: (obj: GameObject) => ObjectSprite,
    private readonly hd?: SpriteLibraryHd,
  ) {}

  /** Ladowanie jednej sciezki (dedupe); blad zapisuje do `failed` i nie rzuca. */
  ensure(path: string): Promise<void> {
    if (this.handles.has(path) || this.failed.has(path)) return Promise.resolve();
    let p = this.loading.get(path);
    if (!p) {
      p = this.loadHandle(path).then(
        (h) => {
          this.handles.set(path, h);
          this.loading.delete(path);
        },
        () => {
          this.failed.add(path);
          this.loading.delete(path);
        },
      );
      this.loading.set(path, p);
    }
    return p;
  }

  /** Oryginalny sprite z cache; z HD (jesli jest wpis i tryb pozwala) zamieniony per asset, fallback do oryginalu. */
  private async loadHandle(path: string): Promise<SpriteHandle> {
    const hd = this.hd;
    if (!hd) return this.cache.get(path);
    const key = path.toLowerCase().replace(/\\/g, '/');
    if (!hd.tiles && TILE_PATH.test(key)) return this.cache.get(path);
    return selectSprite(key, () => this.cache.get(path), hd.override);
  }

  async preload(paths: Iterable<string>, concurrency = 16): Promise<void> {
    const queue = [...new Set(paths)].filter((p) => !this.handles.has(p) && !this.failed.has(p));
    const workers: Promise<void>[] = [];
    let next = 0;
    for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
      workers.push(
        (async () => {
          while (next < queue.length) {
            const p = queue[next++] as string;
            await this.ensure(p);
          }
        })(),
      );
    }
    await Promise.all(workers);
  }

  handle(path: string): SpriteHandle | undefined {
    return this.handles.get(path);
  }

  frameFor(obj: GameObject): ObjectFrame | undefined {
    const { fid, frame } = this.spriteOf(obj);
    const path = this.fids.pathFor(fid);
    if (!path) return undefined;
    const h = this.handles.get(path);
    if (!h) {
      void this.ensure(path);
      return undefined;
    }
    const dir =
      h.directions.length > 1
        ? ((obj.rotation % h.directions.length) + h.directions.length) % h.directions.length
        : 0;
    const frames = h.directions[dir];
    if (!frames || frames.length === 0) return undefined;
    const f = frames[Math.max(0, Math.min(frame, frames.length - 1))];
    if (!f || f.width <= 0 || f.height <= 0) return undefined;
    return {
      texture: f.texture,
      sx: f.sx,
      sy: f.sy,
      width: f.width,
      height: f.height,
      offsetX: f.offsetX,
      offsetY: f.offsetY,
      ...(f.scale ? { scale: f.scale } : {}),
      shiftX: h.shiftX[dir] ?? 0,
      shiftY: h.shiftY[dir] ?? 0,
    };
  }

  /** Klatka kafla: indeks z tiles.lst. Indeks 1 (grid000, siatka edytora) i brak pliku pomijane. */
  tileFrame(index: number): TileFrame | undefined {
    if (index <= 1) return undefined;
    // sciezka goraca (co klatke, ~kilka tysiecy wywolan): trafienia sa cache'owane, braki sprawdzane od nowa
    const hit = this.tileFrames.get(index);
    if (hit) return hit;
    const path = this.fids.pathFor((4 << 24) | index);
    if (!path) return undefined;
    const f = this.handles.get(path)?.directions[0]?.[0];
    if (!f || f.width <= 0) return undefined;
    const frame: TileFrame = {
      texture: f.texture,
      sx: f.sx,
      sy: f.sy,
      width: f.width,
      height: f.height,
      ...(f.bands ? { bands: f.bands } : {}),
      ...(f.scale ? { scale: f.scale } : {}),
    };
    this.tileFrames.set(index, frame);
    return frame;
  }

  tilePath(index: number): string | undefined {
    return index <= 1 ? undefined : this.fids.pathFor((4 << 24) | index);
  }
}
