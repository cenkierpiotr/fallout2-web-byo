import { signal } from '@preact/signals';
import { normalizeDatPath } from '@f2/formats';
import type { HdFileReader } from '../screens/map/hd-rgba';

/** Wybrana przez gracza paczka HD (folder z manifest.json + base/ + hd/); null = HD z folderu gry. */
export interface HdPack {
  name: string;
  /** Liczba wpisow manifestu. */
  entries: number;
  /** Liczba wpisow z zatwierdzonym HD (source != xbrz). */
  hdEntries: number;
  reader: HdFileReader;
}

export const hdPack = signal<HdPack | null>(null);

const ROOT = 'assets-hd';

/**
 * Buduje paczke HD z wybranego folderu. Akceptuje katalog gry (`.../DATA/assets-hd/...`),
 * `DATA` (`assets-hd/...`) albo sam `assets-hd` (`manifest.json` + `base/` + `hd/`). Klucze plikow
 * sa znormalizowane (male litery, '/'), bez nazwy folderu glownego. Zwraca null, gdy brak poprawnego manifestu.
 */
export async function hdPackFromFiles(
  files: Map<string, File>,
  name: string,
): Promise<HdPack | null> {
  let prefix: string | null = null;
  for (const cand of ['data/assets-hd/', 'assets-hd/', '']) {
    if (files.has(`${cand}manifest.json`)) {
      prefix = cand;
      break;
    }
  }
  if (prefix === null) return null;
  let entries = 0;
  let hdEntries = 0;
  try {
    const m = JSON.parse(await files.get(`${prefix}manifest.json`)!.text()) as {
      version?: number;
      entries?: Record<string, { source?: string; approved?: boolean }>;
    };
    if (m.version !== 1 || typeof m.entries !== 'object' || m.entries === null) return null;
    for (const e of Object.values(m.entries)) {
      entries++;
      if (e.source !== 'xbrz' && e.approved) hdEntries++;
    }
  } catch {
    return null;
  }
  const reader: HdFileReader = {
    resolve(path) {
      const norm = normalizeDatPath(path);
      if (!norm.startsWith(`${ROOT}/`)) return undefined;
      const key = prefix + norm.slice(ROOT.length + 1);
      return files.has(key) ? key : undefined;
    },
    async read(key) {
      const f = files.get(key);
      if (!f) throw new Error(`brak pliku paczki HD: ${key}`);
      return new Uint8Array(await f.arrayBuffer());
    },
  };
  return { name, entries, hdEntries, reader };
}
