import { normalizeDatPath } from '@f2/formats';
import type { VfsLayer } from './layer.js';

/** Prefiks sciezek gry, pod ktorym warstwa pakietu udostepnia swoje pliki. */
export const LANG_PACK_PREFIX = 'text/polish/';

/** Zrodlo plikow pakietu: sciezki wzgledne wobec korzenia pakietu (np. `game/stat.msg`). */
export interface LangPackSource {
  list(): string[];
  read(rel: string): Promise<Uint8Array>;
}

export interface LangPackManifest {
  language: string;
  /** Sciezki wzgledne wobec korzenia pakietu (separator `/`). */
  files: string[];
}

export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** Minimalny kontrakt katalogu (File System Access API), zeby nie zalezec od typow DOM. */
export interface DirHandleLike {
  entries(): AsyncIterable<[string, DirEntryLike]>;
}
export type DirEntryLike =
  | { kind: 'file'; getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }> }
  | ({ kind: 'directory' } & DirHandleLike);

function parseManifest(raw: unknown): LangPackManifest {
  const m = raw as Partial<LangPackManifest> | null;
  if (!m || typeof m.language !== 'string' || !Array.isArray(m.files)) {
    throw new Error('manifest pakietu jezykowego: oczekiwano {language, files[]}');
  }
  if (!m.files.every((f) => typeof f === 'string' && f !== '')) {
    throw new Error('manifest pakietu jezykowego: files[] musi zawierac niepuste ciagi');
  }
  return { language: m.language, files: m.files };
}

/**
 * Warstwa pakietu jezykowego PL: mapuje zadanie `text/polish/<x>` na plik pakietu `<x>`.
 * Pliki pakietu sa w UTF-8 (nasz tekst), w przeciwienstwie do `text/polish` z danych gry (cp1250);
 * rozroznienie po nazwie warstwy (`lang-pack:pl`) robi loader MSG.
 * Warstwa powinna byc na DOLE stosu VFS: istniejace polskie pliki gry maja pierwszenstwo.
 */
export class LangPackLayer implements VfsLayer {
  readonly name = 'lang-pack:pl';
  private readonly byKey = new Map<string, string>();

  constructor(private readonly source: LangPackSource) {
    for (const rel of source.list()) {
      this.byKey.set(normalizeDatPath(LANG_PACK_PREFIX + rel), rel);
    }
  }

  has(path: string): boolean {
    return this.byKey.has(normalizeDatPath(path));
  }

  async open(path: string): Promise<Uint8Array> {
    const rel = this.byKey.get(normalizeDatPath(path));
    if (rel === undefined) throw new Error(`brak pliku: ${path}`);
    return this.source.read(rel);
  }

  keys(): Iterable<string> {
    return this.byKey.keys();
  }

  /** Pakiet z buildu: `<baseUrl>/manifest.json` + pliki obok (domyslnie `/lang-packs/pl`). */
  static async fromManifest(
    baseUrl = '/lang-packs/pl',
    fetchFn?: FetchLike,
  ): Promise<LangPackLayer> {
    const doFetch: FetchLike = fetchFn ?? ((u) => fetch(u));
    const base = baseUrl.replace(/\/+$/, '');
    const res = await doFetch(`${base}/manifest.json`);
    if (!res.ok)
      throw new Error(`pakiet jezykowy: manifest ${base}/manifest.json (HTTP ${res.status})`);
    const manifest = parseManifest(await res.json());
    return new LangPackLayer({
      list: () => manifest.files,
      async read(rel) {
        const r = await doFetch(`${base}/${rel.split('/').map(encodeURIComponent).join('/')}`);
        if (!r.ok) throw new Error(`pakiet jezykowy: ${rel} (HTTP ${r.status})`);
        return new Uint8Array(await r.arrayBuffer());
      },
    });
  }

  /** Pakiet z folderu wskazanego przez uzytkownika (FileSystemDirectoryHandle): skan rekurencyjny. */
  static async fromDirectoryHandle(dir: DirHandleLike): Promise<LangPackLayer> {
    const files = new Map<string, () => Promise<Uint8Array>>();
    const walk = async (d: DirHandleLike, rel: string): Promise<void> => {
      for await (const [name, entry] of d.entries()) {
        const r = rel === '' ? name : `${rel}/${name}`;
        if (entry.kind === 'directory') await walk(entry, r);
        else {
          files.set(r, async () => new Uint8Array(await (await entry.getFile()).arrayBuffer()));
        }
      }
    };
    await walk(dir, '');
    files.delete('manifest.json');
    return new LangPackLayer({
      list: () => [...files.keys()],
      read(rel) {
        const f = files.get(rel);
        if (!f) throw new Error(`brak pliku: ${rel}`);
        return f();
      },
    });
  }
}
