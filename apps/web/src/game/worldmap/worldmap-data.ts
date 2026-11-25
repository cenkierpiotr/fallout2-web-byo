import {
  parseCityTxt,
  parseWorldmapTxt,
  type AreaDef,
  type Expr,
  type TableEntry,
  type WorldmapConfig,
} from '@f2/formats';
import type { WmCondition, WmTableEntry } from '@f2/rules';
import type { MapEntry } from '../../screens/map/maps-txt';

/** Mapa swiata: 4 x 5 kafli po 350 x 300 px; kafel = 7 x 6 podkafli po 50 px. */
export const TILES_WIDE = 4;
export const TILES_HIGH = 5;
export const WORLD_W = TILES_WIDE * 350;
export const WORLD_H = TILES_HIGH * 300;
export const SUB_COLS = TILES_WIDE * 7;
export const SUB_ROWS = TILES_HIGH * 6;

export interface WorldmapData {
  cfg: WorldmapConfig;
  areas: AreaDef[];
  maps: MapEntry[];
}

export function buildWorldmapData(
  worldmapTxt: string,
  cityTxt: string,
  maps: MapEntry[],
): WorldmapData {
  return { cfg: parseWorldmapTxt(worldmapTxt), areas: parseCityTxt(cityTxt), maps };
}

/** Wyrazenie z worldmap.txt (@f2/formats) na warunek silnika (@f2/rules). */
export function toWmCondition(e: Expr): WmCondition {
  if ('op' in e) {
    const op = e.op === '&' ? 'and' : e.op;
    return { op, left: toWmCondition(e.left), right: toWmCondition(e.right) };
  }
  switch (e.kind) {
    case 'player':
      return { kind: 'player', stat: e.stat };
    case 'global':
      return { kind: 'global', idx: e.idx };
    case 'time':
      return { kind: 'time' };
    case 'enctr':
      return { kind: 'critters' };
    case 'rand':
      return { kind: 'rand', pct: e.pct };
    case 'const':
      return { kind: 'const', value: e.value };
  }
}

/** Wpis tabeli spotkan (formats) na wpis wyboru (rules); counter -1 = bez limitu. */
export function toWmEntry(e: TableEntry): WmTableEntry {
  const out: WmTableEntry = {
    chance: e.chance,
    counter: e.counter ?? -1,
    map: e.map ?? -1,
    special: e.special,
  };
  if (e.condition) out.condition = toWmCondition(e.condition);
  return out;
}

const norm = (s: string): string => s.trim().toLowerCase();

/** Nazwa pliku mapy z nazwy lookup (maps.txt) albo indeksu. */
export function mapNameOf(maps: readonly MapEntry[], lookup: string | number): string | undefined {
  if (typeof lookup === 'number') return maps.find((m) => m.index === lookup)?.name;
  const l = norm(lookup);
  return maps.find((m) => norm(m.lookup) === l || norm(m.name) === l)?.name;
}

/** Obszar (miasto), do ktorego nalezy dana mapa lokalna (przez wejscia z city.txt). */
export function areaOfMap(
  data: Pick<WorldmapData, 'areas' | 'maps'>,
  mapName: string,
): AreaDef | undefined {
  const n = norm(mapName);
  const lookups = new Set(data.maps.filter((m) => norm(m.name) === n).map((m) => norm(m.lookup)));
  if (lookups.size === 0) return undefined;
  return data.areas.find((a) => a.entrances.some((e) => lookups.has(norm(e.mapLookupName))));
}

/** Promien kola miasta w px swiata (Z: wartosci przyblizone, rozmiar small/medium/large). */
export const AREA_RADIUS = { Small: 10, Medium: 15, Large: 20 } as const;
