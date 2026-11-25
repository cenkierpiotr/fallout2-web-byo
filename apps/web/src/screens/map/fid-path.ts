import { lstName, parseLst } from '@f2/formats';
import { animFileChars, openGameFile } from '@f2/engine-core';
import type { VirtualFs } from '@f2/vfs';

/** Katalogi typow FID (fid.md): 0 items ... 10 skilldex. */
export const FID_DIRS = [
  'items',
  'critters',
  'scenery',
  'walls',
  'tiles',
  'misc',
  'intrface',
  'inven',
  'heads',
  'backgrnd',
  'skilldex',
] as const;

export interface FidParts {
  index: number;
  weapon: number;
  anim: number;
  type: number;
  orientation: number;
}

export function parseFid(fid: number): FidParts {
  return {
    index: fid & 0xfff,
    weapon: (fid >> 12) & 0xf,
    anim: (fid >> 16) & 0xff,
    type: (fid >> 24) & 0xf,
    orientation: (fid >> 28) & 0x7,
  };
}

export function makeCritterFid(index: number, anim: number, weapon = 0): number {
  return ((1 << 24) | (anim << 16) | (weapon << 12) | index) >>> 0;
}

/**
 * Sciezka FRM dla FID. Listy `art/<katalog>/<katalog>.lst` laduje `load()`; `pathFor` jest synchroniczne
 * (po `load`), bo ObjectSpriteSource.frameFor musi byc synchroniczne.
 */
export class FidResolver {
  private readonly lists = new Map<number, string[]>();

  constructor(private readonly vfs: VirtualFs) {}

  async load(): Promise<void> {
    await Promise.all(
      FID_DIRS.map(async (dir, type) => {
        if (this.lists.has(type)) return;
        try {
          const bytes = await openGameFile(this.vfs, `art/${dir}/${dir}.lst`);
          this.lists.set(type, parseLst(bytes).map(lstName));
        } catch {
          this.lists.set(type, []);
        }
      }),
    );
    this.loaded = true;
  }

  /** Indeks wpisu w liscie typu (np. 'hmjmps' w critters), -1 gdy brak. */
  indexOf(type: number, name: string): number {
    const list = this.lists.get(type) ?? [];
    const n = name.toLowerCase();
    return list.findIndex((e) => e.toLowerCase().replace(/\.frm$/, '') === n);
  }

  /** Pamiec podreczna fid -> sciezka (wywolywane co klatke dla kazdego obiektu; listy sa niezmienne po `load`). */
  private readonly paths = new Map<number, string | null>();
  private loaded = false;

  pathFor(fid: number): string | undefined {
    const hit = this.paths.get(fid);
    if (hit !== undefined) return hit ?? undefined;
    const path = this.resolvePath(fid);
    // przed `load` listy sa puste: nie zapamietuj, zeby po zaladowaniu sciezka sie znalazla
    if (this.loaded) this.paths.set(fid, path ?? null);
    return path;
  }

  private resolvePath(fid: number): string | undefined {
    const p = parseFid(fid);
    const dir = FID_DIRS[p.type];
    const list = this.lists.get(p.type);
    if (dir === undefined || !list) return undefined;
    const name = list[p.index];
    if (!name) return undefined;
    if (p.type === 1) {
      const base = name.replace(/\.frm$/i, '');
      const ext = p.orientation > 0 ? `fr${p.orientation - 1}` : 'frm';
      const chars = animFileChars(p.anim, p.weapon);
      if (chars === undefined) return undefined;
      return `art/critters/${base}${chars}.${ext}`.toLowerCase();
    }
    if (p.type === 8) return undefined; // glowy: poza ekranem mapy
    return `art/${dir}/${name}`.toLowerCase();
  }
}
