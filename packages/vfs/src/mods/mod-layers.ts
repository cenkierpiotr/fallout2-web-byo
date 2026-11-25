import { Dat2Layer } from '../dat2-layer.js';
import type { VfsLayer } from '../layer.js';
import { MemoryLayer } from '../memory-layer.js';
import { VirtualFs } from '../vfs.js';

/** Zrodlo dostepu swobodnego (jak RandomAccessSource z @f2/formats) z opcjonalnym zamknieciem. */
export interface ModSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
  close?(): Promise<void>;
}

export interface ModFsEntry {
  name: string;
  kind: 'file' | 'directory';
}

/**
 * Abstrakcja systemu plikow dla modow. Sciezki wzgledne wobec korzenia gry, separator `/`,
 * `''` = korzen. Dokladne dopasowanie nazw (wielkosc liter rozwiazuje buildModLayers).
 */
export interface ModFs {
  /** Wpisy katalogu albo undefined, gdy katalog nie istnieje. */
  readDir(path: string): Promise<ModFsEntry[] | undefined>;
  readFile(path: string): Promise<Uint8Array>;
  openSource(path: string): Promise<ModSource>;
}

export interface ModLayerConfig {
  /** Z ddraw.ini (parseDdrawIni.patchFiles), wzgledne wobec korzenia gry. */
  patchFiles: string[];
  /** Z mods_order.txt; undefined = brak pliku (wtedy wszystkie mods/*.dat alfabetycznie). */
  modsOrder?: string[] | undefined;
  /** Katalog modow, domyslnie `mods`. */
  modsDir?: string;
}

export interface ModLayers {
  /** NAJWYZSZY priorytet pierwszy (jak VirtualFs.layers). */
  layers: VfsLayer[];
  /** Wpisy konfiguracji bez pliku albo z uszkodzonym DAT, w oryginalnej pisowni. */
  skipped: string[];
  close(): Promise<void>;
}

const splitPath = (p: string): string[] => p.split(/[\\/]+/).filter((s) => s !== '');

/** Rozwiazuje sciezke segment po segmencie bez wielkosci liter; zwraca sciezke z prawdziwa pisownia. */
async function resolveCi(
  fs: ModFs,
  base: string,
  rel: string,
): Promise<{ path: string; kind: 'file' | 'directory' } | undefined> {
  let cur = base;
  let kind: 'file' | 'directory' = 'directory';
  const segs = splitPath(rel);
  for (let i = 0; i < segs.length; i++) {
    const seg = (segs[i] as string).toLowerCase();
    const entries = await fs.readDir(cur);
    const hit = entries?.find((e) => e.name.toLowerCase() === seg);
    if (!hit) return undefined;
    if (i < segs.length - 1 && hit.kind !== 'directory') return undefined;
    cur = cur === '' ? hit.name : `${cur}/${hit.name}`;
    kind = hit.kind;
  }
  return { path: cur, kind };
}

async function collectFiles(
  fs: ModFs,
  dir: string,
  rel: string,
  out: Map<string, string>,
): Promise<void> {
  for (const e of (await fs.readDir(dir)) ?? []) {
    const abs = `${dir}/${e.name}`;
    const r = rel === '' ? e.name : `${rel}/${e.name}`;
    if (e.kind === 'directory') await collectFiles(fs, abs, r, out);
    else out.set(r, abs);
  }
}

/**
 * Buduje warstwy modow. Priorytet rosnaco: patchFiles w kolejnosci, potem wpisy mods wg modsOrder
 * (pozniejszy = wyzszy). Wynik: layers od najwyzszego priorytetu.
 */
export async function buildModLayers(fs: ModFs, cfg: ModLayerConfig): Promise<ModLayers> {
  const modsDir = cfg.modsDir ?? 'mods';
  const skipped: string[] = [];
  const opened: ModSource[] = [];

  // Lista (wpis, baza) od najnizszego priorytetu
  const wanted: { entry: string; base: string }[] = cfg.patchFiles.map((entry) => ({
    entry,
    base: '',
  }));
  let modEntries: string[];
  if (cfg.modsOrder !== undefined) modEntries = cfg.modsOrder;
  else {
    const dir = await resolveCi(fs, '', modsDir);
    const listing = dir?.kind === 'directory' ? await fs.readDir(dir.path) : undefined;
    modEntries = (listing ?? [])
      .filter((e) => e.kind === 'file' && e.name.toLowerCase().endsWith('.dat'))
      .map((e) => e.name)
      .sort((a, b) => {
        const x = a.toLowerCase();
        const y = b.toLowerCase();
        return x < y ? -1 : x > y ? 1 : 0;
      });
  }
  for (const entry of modEntries) wanted.push({ entry, base: modsDir });

  // Duplikaty tego samego pliku: wygrywa pozniejsza pozycja
  const resolved: { entry: string; path: string; kind: 'file' | 'directory' }[] = [];
  for (const w of wanted) {
    const r = await resolveCi(fs, '', w.base === '' ? w.entry : `${w.base}/${w.entry}`);
    if (!r) {
      skipped.push(w.entry);
      continue;
    }
    resolved.push({ entry: w.entry, path: r.path, kind: r.kind });
  }
  const lastIdx = new Map<string, number>();
  resolved.forEach((r, i) => lastIdx.set(r.path.toLowerCase(), i));
  const unique = resolved.filter((r, i) => lastIdx.get(r.path.toLowerCase()) === i);

  const lowToHigh: VfsLayer[] = [];
  for (const r of unique) {
    if (r.kind === 'directory') {
      const files = new Map<string, string>();
      await collectFiles(fs, r.path, '', files);
      const content = new Map<string, () => Promise<Uint8Array>>();
      for (const [rel, abs] of files) content.set(rel, () => fs.readFile(abs));
      lowToHigh.push(new MemoryLayer(`${r.path.toLowerCase()}/`, content));
      continue;
    }
    let src: ModSource | undefined;
    try {
      src = await fs.openSource(r.path);
      opened.push(src);
      lowToHigh.push(await Dat2Layer.open(r.path.toLowerCase(), src));
    } catch {
      skipped.push(r.entry);
      if (src) {
        opened.splice(opened.indexOf(src), 1);
        await src.close?.().catch(() => undefined);
      }
    }
  }

  let closed = false;
  return {
    layers: lowToHigh.reverse(),
    skipped,
    async close() {
      if (closed) return;
      closed = true;
      await Promise.all(opened.map((s) => s.close?.().catch(() => undefined)));
    },
  };
}

/** Mody wchodza NAD wszystkie warstwy bazowe (overlay data/, patch000, critter, master). */
export function withModLayers(base: VirtualFs, mods: ModLayers): VirtualFs {
  return new VirtualFs([...mods.layers, ...base.layers]);
}
