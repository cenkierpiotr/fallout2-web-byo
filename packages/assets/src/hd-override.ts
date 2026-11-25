import type { IndexedTexture } from '@f2/render';
import type { SpriteFrameRef, SpriteHandle } from './sprite-cache.js';

export type HdMode = 'original' | 'base' | 'hd';

/** Minimalny sygnal (zgodny strukturalnie z Signal z engine-core). */
export interface ModeSignal {
  value: HdMode;
  subscribe(fn: (v: HdMode) => void): () => void;
}

export interface FileHandleLike {
  getFile(): Promise<{ text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }>;
}
export interface DirectoryHandleLike {
  getFileHandle(name: string): Promise<FileHandleLike>;
  getDirectoryHandle(name: string): Promise<DirectoryHandleLike>;
}

interface ManifestFrame {
  dir: number;
  frame: number;
  rect: [number, number, number, number];
  offX: number;
  offY: number;
}
interface ManifestEntry {
  source: 'xbrz' | 'gemini' | 'flux';
  frm: string;
  scale: number;
  atlas: string;
  frames: ManifestFrame[];
  approved: boolean;
}
interface Manifest {
  version: number;
  entries: Record<string, ManifestEntry>;
}

export interface HdOverrideDeps {
  /** Dekoduje PNG atlasu i wgrywa do GPU (RGBA); w przegladarce createImageBitmap. */
  loadAtlas(png: ArrayBuffer, width?: number, height?: number): Promise<IndexedTexture>;
  /** Maks. liczba rownoczesnie trzymanych atlasow HD (LRU, limit VRAM). */
  maxAtlases?: number;
  onEvict?(texture: IndexedTexture): void;
}

/** Katalog atlasu w folderze assets-hd wg zrodla wpisu. */
function atlasDir(source: ManifestEntry['source']): string {
  return source === 'xbrz' ? 'base' : 'hd';
}

function createModeSignal(initial: HdMode): ModeSignal {
  let v = initial;
  const subs = new Set<(v: HdMode) => void>();
  return {
    get value() {
      return v;
    },
    set value(n: HdMode) {
      if (n === v) return;
      v = n;
      for (const f of [...subs]) f(v);
    },
    subscribe(fn) {
      subs.add(fn);
      fn(v);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

export class HdOverride {
  readonly mode: ModeSignal = createModeSignal('original');
  private manifest: Manifest | null = null;
  private readonly atlases = new Map<string, Promise<IndexedTexture>>();
  private readonly sprites = new Map<string, { atlasKey: string; handle: SpriteHandle }>();

  constructor(
    private readonly source: DirectoryHandleLike | null,
    private readonly deps: HdOverrideDeps,
  ) {}

  async load(): Promise<void> {
    if (!this.source) return;
    try {
      const fh = await this.source.getFileHandle('manifest.json');
      const m = JSON.parse(await (await fh.getFile()).text()) as Manifest;
      if (m.version !== 1 || typeof m.entries !== 'object' || m.entries === null) return;
      this.manifest = m;
    } catch {
      this.manifest = null; // brak folderu assets-hd: tryby base/hd cicho degraduja do oryginalu
    }
  }

  private entryFor(frmPath: string): ManifestEntry | null {
    const e = this.manifest?.entries[frmPath.toLowerCase()];
    if (!e) return null;
    const mode = this.mode.value;
    if (mode === 'original') return null;
    if (mode === 'base') return e.source === 'xbrz' || e.approved ? e : null;
    return e.approved ? e : null;
  }

  /** Czy w biezacym trybie istnieje nadpisanie HD dla tego FRM. */
  has(frmPath: string): boolean {
    return this.entryFor(frmPath) !== null;
  }

  /**
   * Sprite HD (scale 4, rect i offsety x4). `base` (opcjonalny) dostarcza fps/actionFrame
   * i przesuniecia klatek (x scale). Zwraca null, gdy tryb/wpis nie pozwala.
   */
  async getSprite(frmPath: string, base?: SpriteHandle): Promise<SpriteHandle | null> {
    const e = this.entryFor(frmPath);
    if (!e || !this.source) return null;
    const key = `${frmPath.toLowerCase()}|${e.source}|${base ? 1 : 0}`;
    const cached = this.sprites.get(key);
    if (cached) return cached.handle;
    let replicate = false;
    const dirCount = e.frames.reduce((m, f) => Math.max(m, f.dir + 1), 0);
    const perDir = e.frames.reduce((m, f) => Math.max(m, f.frame + 1), 0);
    // niekompletny wpis HD (inna liczba kierunkow/klatek niz oryginal) = zostaje oryginal,
    // inaczej animacja/obrot indeksowalyby brakujaca klatke
    if (base) {
      const baseDirs = base.directions.length;
      // FRM kafli/scian ma w nagluwku 6 kierunkow wskazujacych te same dane; wpis HD z jednym
      // kierunkiem wolno wtedy powielic na wszystkie (tylko gdy oryginalne kierunki sa identyczne)
      replicate =
        dirCount === 1 &&
        baseDirs > 1 &&
        !/^art\/critters\//i.test(frmPath) &&
        directionsIdentical(base);
      if (
        (!replicate && dirCount !== baseDirs) ||
        e.frames.length !== dirCount * base.framesPerDirection
      ) {
        return null;
      }
    }
    const texture = await this.atlasTexture(e);
    const k = e.scale;
    const directions: SpriteFrameRef[][] = Array.from({ length: dirCount }, () => []);
    for (const f of e.frames) {
      directions[f.dir]![f.frame] = {
        texture,
        sx: f.rect[0],
        sy: f.rect[1],
        width: f.rect[2],
        height: f.rect[3],
        offsetX: f.offX,
        offsetY: f.offY,
        scale: k,
      };
    }
    // dziura (powtorzona para dir/frame przy zgodnej liczbie klatek) = niekompletny wpis, zostaje oryginal
    for (const d of directions) {
      for (let i = 0; i < perDir; i++) if (!d[i]) return null;
    }
    if (replicate && base) {
      const d0 = directions[0]!;
      for (let i = 1; i < base.directions.length; i++) directions[i] = d0;
    }
    const shiftX = new Int16Array(base?.shiftX.length ?? perDir);
    const shiftY = new Int16Array(base?.shiftY.length ?? perDir);
    if (base) {
      for (let i = 0; i < shiftX.length; i++) {
        shiftX[i] = base.shiftX[i]! * k;
        shiftY[i] = base.shiftY[i]! * k;
      }
    }
    const h: SpriteHandle = {
      fps: base?.fps ?? 10,
      actionFrame: base?.actionFrame ?? 0,
      framesPerDirection: base?.framesPerDirection ?? perDir,
      directions,
      shiftX,
      shiftY,
    };
    this.sprites.set(key, { atlasKey: `${atlasDir(e.source)}/${e.atlas}`, handle: h });
    return h;
  }

  private atlasTexture(e: ManifestEntry): Promise<IndexedTexture> {
    const key = `${atlasDir(e.source)}/${e.atlas}`;
    const hit = this.atlases.get(key);
    if (hit) {
      // LRU: odswiez kolejnosc
      this.atlases.delete(key);
      this.atlases.set(key, hit);
      return hit;
    }
    const p = (async () => {
      const dir = await this.source!.getDirectoryHandle(atlasDir(e.source));
      const fh = await dir.getFileHandle(e.atlas);
      const buf = await (await fh.getFile()).arrayBuffer();
      return this.deps.loadAtlas(buf);
    })();
    this.atlases.set(key, p);
    p.catch(() => this.atlases.delete(key));
    const max = this.deps.maxAtlases ?? 8;
    while (this.atlases.size > max) {
      const oldest = this.atlases.keys().next().value as string;
      const ev = this.atlases.get(oldest)!;
      this.atlases.delete(oldest);
      for (const [k, v] of this.sprites) if (v.atlasKey === oldest) this.sprites.delete(k);
      void ev.then((t) => this.deps.onEvict?.(t)).catch(() => undefined);
    }
    return p;
  }
}

/** Czy wszystkie kierunki oryginalnego sprite'a maja te same wymiary i przesuniecia (kopie tych samych danych; piksele nie sa porownywane). */
function directionsIdentical(base: SpriteHandle): boolean {
  const first = base.directions[0];
  if (!first) return false;
  return base.directions.every(
    (d) =>
      d.length === first.length &&
      d.every((f, i) => {
        const g = first[i]!;
        return (
          f.width === g.width &&
          f.height === g.height &&
          f.offsetX === g.offsetX &&
          f.offsetY === g.offsetY
        );
      }),
  );
}

/** Wybor sprite'a: HD gdy tryb != original i wpis istnieje, inaczej FRM z AssetManagera. */
export async function selectSprite(
  frmPath: string,
  loadBase: (path: string) => Promise<SpriteHandle>,
  hd: HdOverride | undefined,
): Promise<SpriteHandle> {
  const base = await loadBase(frmPath);
  if (hd?.has(frmPath)) {
    try {
      const s = await hd.getSprite(frmPath, base);
      if (s) return s;
    } catch {
      /* brak/uszkodzony atlas: fallback do oryginalu per asset */
    }
  }
  return base;
}
