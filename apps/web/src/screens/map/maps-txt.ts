import { parseAmbientSfx, type AmbientSfx } from '@f2/audio';

export interface MapEntry {
  /** Numer sekcji [Map NNN]; to indeks uzywany w exit gridach (destMap). */
  index: number;
  /** Nazwa pliku mapy wielkimi literami, np. ARTEMPLE. */
  name: string;
  lookup: string;
  /** Utwor tla z `music=` (bez rozszerzenia), np. 07desert. */
  music?: string;
  /** `random_start_point_N` (elev, tile_num): punkty startowe formacji spotkan innych niz Surrounding. */
  randomStarts?: { elevation: number; tileNum: number }[];
  /** Efekty otoczenia z `ambient_sfx=` (max 6; szansa jako waga to Z). */
  ambientSfx?: AmbientSfx[];
}

/** Parser data/maps.txt (INI: sekcje `[Map NNN]`, pola `map_name=`, `lookup_name=`; komentarze po `;`). */
export function parseMapsTxt(text: string): MapEntry[] {
  const out: MapEntry[] = [];
  let cur: {
    index: number;
    name: string;
    lookup: string;
    music?: string;
    starts: { elevation: number; tileNum: number }[];
    ambient?: AmbientSfx[];
  } | null = null;
  const flush = (): void => {
    if (cur && cur.name)
      out.push({
        index: cur.index,
        name: cur.name.toUpperCase(),
        lookup: cur.lookup,
        ...(cur.music ? { music: cur.music } : {}),
        ...(cur.starts.length > 0 ? { randomStarts: cur.starts } : {}),
        ...(cur.ambient?.length ? { ambientSfx: cur.ambient } : {}),
      });
    cur = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split(';')[0]?.trim() ?? '';
    if (!line) continue;
    const sec = /^\[Map\s+(\d+)\]$/i.exec(line);
    if (sec) {
      flush();
      cur = { index: Number(sec[1]), name: '', lookup: '', starts: [] };
      continue;
    }
    if (!cur) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const val = line.slice(eq + 1).trim();
    if (key === 'map_name') cur.name = val;
    else if (key === 'lookup_name') cur.lookup = val;
    else if (key === 'music' && val) cur.music = val;
    else if (/^random_start_point_\d+$/.test(key)) {
      const m = /^elev:\s*(-?\d+)\s*,\s*tile_num:\s*(-?\d+)$/i.exec(val);
      if (m) cur.starts.push({ elevation: Number(m[1]), tileNum: Number(m[2]) });
    } else if (key === 'ambient_sfx' && val) cur.ambient = parseAmbientSfx(val);
  }
  flush();
  return out;
}

/** Mapy z maps.txt, ktore istnieja jako plik `maps/<nazwa>.map`; potem pozostale pliki .map spoza maps.txt. */
export function listMaps(entries: MapEntry[], mapFileKeys: string[]): MapEntry[] {
  const files = new Set<string>();
  for (const k of mapFileKeys) {
    const m = /(?:^|\/)maps\/([^/]+)\.map$/i.exec(k);
    if (m?.[1]) files.add(m[1].toUpperCase());
  }
  const known = new Set<string>();
  const out: MapEntry[] = [];
  for (const e of entries) {
    if (files.has(e.name) && !known.has(e.name)) {
      known.add(e.name);
      out.push(e);
    }
  }
  for (const f of [...files].sort()) {
    if (!known.has(f)) out.push({ index: -1, name: f, lookup: '' });
  }
  return out;
}
