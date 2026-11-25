import type { MovieAssets, MovieName } from '@f2/video';

export interface MovieFileLike {
  name: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export function decodeCp1252(bytes: Uint8Array): string {
  return new TextDecoder('windows-1252').decode(bytes);
}

function baseAndExt(name: string): { base: string; ext: string } | null {
  const leaf = name.split(/[\\/]/).pop() ?? name;
  const dot = leaf.lastIndexOf('.');
  if (dot <= 0) return null;
  return { base: leaf.slice(0, dot).toLowerCase(), ext: leaf.slice(dot + 1).toLowerCase() };
}

/** Pliki filmow wskazane przez uzytkownika (np. folder z *.mve, *.sve, *.cfg). */
export class MovieLibrary {
  private readonly mve = new Map<string, MovieFileLike>();
  private readonly sve = new Map<string, MovieFileLike>();
  private readonly cfg = new Map<string, MovieFileLike>();

  constructor(files: Iterable<MovieFileLike>) {
    for (const f of files) {
      const p = baseAndExt(f.name);
      if (!p) continue;
      if (p.ext === 'mve') this.mve.set(p.base, f);
      else if (p.ext === 'sve') this.sve.set(p.base, f);
      else if (p.ext === 'cfg') this.cfg.set(p.base, f);
    }
  }

  names(): string[] {
    return [...this.mve.keys()].sort();
  }

  has(name: string): boolean {
    return this.mve.has(name.toLowerCase());
  }

  async load(name: MovieName | string): Promise<MovieAssets | null> {
    const key = name.toLowerCase();
    const m = this.mve.get(key);
    if (!m) return null;
    const bytes = async (f: MovieFileLike) => new Uint8Array(await f.arrayBuffer());
    const assets: MovieAssets = { mve: await bytes(m) };
    const s = this.sve.get(key);
    if (s) assets.sve = decodeCp1252(await bytes(s));
    const c = this.cfg.get(key);
    if (c) assets.cfg = decodeCp1252(await bytes(c));
    return assets;
  }
}
