import { FormatError } from '../errors.js';
import { parseCondition, type Expr } from './encounter-dsl.js';
import { parseIni } from './ini.js';

export type FreqName = 'Forced' | 'Frequent' | 'Common' | 'Uncommon' | 'Rare' | 'None';
export type RandomMapTerrain = 'Desert' | 'Mountain' | 'City' | 'Ocean';
export type PositionKind =
  'Surrounding' | 'huddle' | 'wedge' | 'straight_line' | 'double_line' | 'cone';

export interface EncounterItem {
  pid: number;
  min: number;
  max: number;
  wielded: boolean;
}
export interface EncounterSlot {
  ratio?: number;
  pid: number;
  items: EncounterItem[];
  script?: number;
  dead: boolean;
  distance?: number;
  /** Staly heks slotu (`tilenum`), -1 = brak. */
  tilenum?: number;
  condition?: Expr;
}
export interface EncounterDef {
  name: string;
  types: EncounterSlot[];
  teamNum: number;
  position: { kind: PositionKind; spacing: number; distance: Expr | number };
}
export interface TableEncounterRef {
  name: string;
  min: number;
  max: number;
}
export type RelationOp = 'AMBUSH' | 'FIGHTING' | 'AND';
export interface EncounterRelation {
  op: RelationOp;
  left: number | 'player';
  right: number | 'player';
}
export interface TableEntry {
  chance: number;
  encounters: TableEncounterRef[];
  relation?: 'AMBUSH' | 'FIGHTING' | 'AND';
  /** Wszystkie relacje lancucha `Enc:` w kolejnosci zapisu (left/right = indeks grupy w `encounters` albo 'player'). */
  relations?: EncounterRelation[];
  scenery?: string;
  condition?: Expr;
  special: boolean;
  /** Pola obecne tylko w wpisach Special (rozszerzenie wzgledem planu). */
  counter?: number;
  map?: string;
  specialName?: string;
}
export interface EncounterTableDef {
  index: number;
  lookupName: string;
  maps: string[];
  entries: TableEntry[];
}
export interface TileCell {
  terrain: string;
  fill: 'Fill_W' | 'No_Fill';
  morning: string;
  afternoon: string;
  night: string;
  encTable: string;
}
export interface TileDef {
  index: number;
  artIdx: number;
  encounterDifficulty: number;
  /** Obecne tylko w 7 z 20 kafli. */
  walkMaskName?: string;
  /** cells[y][x]: 6 wierszy x 7 kolumn; klucz pliku to `x_y`. */
  cells: TileCell[][];
}
export interface WorldmapConfig {
  data: { frequencies: Record<FreqName, number>; terrainTypes: Record<string, number> };
  randomMaps: Record<RandomMapTerrain, string[]>;
  encounters: Map<string, EncounterDef>;
  tables: EncounterTableDef[];
  tiles: TileDef[];
}

const FREQS: FreqName[] = ['Forced', 'Frequent', 'Common', 'Uncommon', 'Rare', 'None'];
const TERRAINS: RandomMapTerrain[] = ['Desert', 'Mountain', 'City', 'Ocean'];
const POS_KINDS: PositionKind[] = [
  'Surrounding',
  'huddle',
  'wedge',
  'straight_line',
  'double_line',
  'cone',
];
const TILE_W = 7;
const TILE_H = 6;

const fail = (msg: string, line?: number): never => {
  throw new FormatError('worldmap.txt', msg, line);
};

function num(s: string, what: string, line: number): number {
  const t = s.trim().replace(/%$/, '');
  const n = Number(t);
  if (t === '' || !Number.isFinite(n)) return fail(`${what}: oczekiwano liczby, jest '${s}'`, line);
  return n;
}

/** Podzial po przecinkach poza nawiasami. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const c of s) {
    if (c === '(' || c === '{') depth++;
    else if (c === ')' || c === '}') depth--;
    if (c === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

const keyOf = (seg: string): { key: string; val: string } => {
  const i = seg.indexOf(':');
  return i < 0
    ? { key: seg.trim().toLowerCase(), val: '' }
    : { key: seg.slice(0, i).trim().toLowerCase(), val: seg.slice(i + 1).trim() };
};

function cond(src: string, line: number): Expr {
  try {
    return parseCondition(src);
  } catch (e) {
    return fail(`warunek '${src}': ${(e as Error).message}`, line);
  }
}

function parseItems(val: string, line: number): EncounterItem[] {
  return val
    .split(/\s*\bItem:\s*/i)
    .filter((p) => p.trim() !== '')
    .map((p) => {
      const m = /^(?:\((\d+)-(\d+)\))?\s*(\d+)\s*(?:[({]\s*wielded\s*[)}])?\s*$/i.exec(p.trim());
      if (!m) return fail(`Item: zly zapis '${p}'`, line);
      const min = m[1] === undefined ? 1 : Number(m[1]);
      const max = m[2] === undefined ? 1 : Number(m[2]);
      return { pid: Number(m[3]), min, max, wielded: /wielded/i.test(p) };
    });
}

function parseSlot(src: string, line: number): EncounterSlot {
  const slot: EncounterSlot = { pid: -1, items: [], dead: false };
  let havePid = false;
  for (const seg of splitTop(src)) {
    if (/^if\b/i.test(seg)) {
      slot.condition = cond(seg, line);
      continue;
    }
    if (/^dead$/i.test(seg)) {
      slot.dead = true;
      continue;
    }
    const { key, val } = keyOf(seg);
    if (key === 'ratio') slot.ratio = num(val, 'Ratio', line);
    else if (key === 'pid') {
      slot.pid = num(val, 'pid', line);
      havePid = true;
    } else if (key === 'item') slot.items.push(...parseItems(seg.replace(/^item:\s*/i, ''), line));
    else if (key === 'script') slot.script = num(val, 'Script', line);
    else if (key === 'distance') slot.distance = num(val, 'Distance', line);
    else if (key === 'tilenum') slot.tilenum = num(val, 'tilenum', line);
    else fail(`type: nieznany segment '${seg}'`, line);
  }
  if (!havePid) fail(`type: brak pid w '${src}'`, line);
  return slot;
}

function parseEncounter(name: string, entries: Map<string, string>, line: number): EncounterDef {
  const types = [...entries.keys()]
    .map((k) => ({ k, m: /^type_(\d+)$/i.exec(k) }))
    .filter((e) => e.m)
    .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
    .map((e) => parseSlot(entries.get(e.k)!, line));
  const def: EncounterDef = {
    name,
    types,
    teamNum: -1,
    // domyslnie wg komentarza w pliku: "Distance:Player(Perception) ; This is the default Distance"
    position: { kind: 'Surrounding', spacing: 0, distance: { kind: 'player', stat: 'Perception' } },
  };
  const team = entries.get('team_num');
  if (team !== undefined) def.teamNum = num(team, 'team_num', line);
  const pos = entries.get('position');
  if (pos !== undefined) {
    const segs = splitTop(pos);
    const kind = POS_KINDS.find((k) => k.toLowerCase() === (segs[0] ?? '').toLowerCase());
    if (!kind) fail(`position: nieznany rodzaj '${segs[0]}'`, line);
    def.position.kind = kind!;
    for (const seg of segs.slice(1)) {
      const { key, val } = keyOf(seg);
      if (key === 'spacing') def.position.spacing = num(val, 'Spacing', line);
      else if (key === 'distance')
        def.position.distance = /^-?\d+$/.test(val) ? Number(val) : cond(val, line);
      else fail(`position: nieznany segment '${seg}'`, line);
    }
  }
  return def;
}

/** Lancuch `(a-b) G1 AND (c-d) G2 FIGHTING Player`: relacje miedzy sasiednimi elementami (grupa albo Player). */
export function parseRelations(val: string): EncounterRelation[] {
  const out: EncounterRelation[] = [];
  let group = -1;
  let prev: number | 'player' | undefined;
  let op: RelationOp | undefined;
  for (const m of val.matchAll(
    /\(\d+-\d+\)\s*[A-Za-z0-9_]+|\b(AND|FIGHTING|AMBUSH)\b|\bPlayer\b/g,
  )) {
    const t = m[0];
    const up = t.toUpperCase();
    if (up === 'AND' || up === 'FIGHTING' || up === 'AMBUSH') {
      op = up;
      continue;
    }
    const cur: number | 'player' = up === 'PLAYER' ? 'player' : ++group;
    if (prev !== undefined && op !== undefined) out.push({ op, left: prev, right: cur });
    prev = cur;
    op = undefined;
  }
  return out;
}

function parseEntry(src: string, line: number): TableEntry {
  const e: TableEntry = { chance: 0, encounters: [], special: false };
  for (const seg of splitTop(src)) {
    if (/^if\b/i.test(seg)) {
      e.condition = cond(seg, line);
      continue;
    }
    if (/^special$/i.test(seg)) {
      e.special = true;
      continue;
    }
    const { key, val } = keyOf(seg);
    if (key === 'chance') e.chance = num(val, 'Chance', line);
    else if (key === 'counter') e.counter = num(val, 'Counter', line);
    else if (key === 'map') e.map = val;
    else if (key === 'scenery') e.scenery = val;
    else if (key === 'enc') {
      const refs = [...val.matchAll(/\((\d+)-(\d+)\)\s*([A-Za-z0-9_]+)/g)];
      if (refs.length === 0) {
        if (!/^[A-Za-z0-9_]+$/.test(val)) fail(`Enc: zly zapis '${val}'`, line);
        e.specialName = val;
      }
      e.encounters = refs.map((m) => ({ name: m[3]!, min: Number(m[1]), max: Number(m[2]) }));
      if (/\bAND\b/.test(val)) e.relation = 'AND';
      else if (/\bFIGHTING\b/.test(val)) e.relation = 'FIGHTING';
      else if (/\bAMBUSH\b/.test(val)) e.relation = 'AMBUSH';
      const rels = parseRelations(val);
      if (rels.length > 0) e.relations = rels;
    } else fail(`enc: nieznany segment '${seg}'`, line);
  }
  return e;
}

function parseTile(index: number, entries: Map<string, string>, line: number): TileDef {
  const req = (k: string): string => entries.get(k) ?? fail(`Tile ${index}: brak ${k}`, line);
  const cells: TileCell[][] = Array.from({ length: TILE_H }, () =>
    Array.from({ length: TILE_W }, () => ({
      terrain: '',
      fill: 'No_Fill' as const,
      morning: 'None',
      afternoon: 'None',
      night: 'None',
      encTable: '',
    })),
  );
  for (const [k, v] of entries) {
    const m = /^(\d+)_(\d+)$/.exec(k);
    if (!m) continue;
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (x >= TILE_W || y >= TILE_H)
      fail(`Tile ${index}: komorka ${k} poza siatka ${TILE_W}x${TILE_H}`, line);
    const p = v.split(',').map((s) => s.trim());
    if (p.length !== 6) fail(`Tile ${index}: ${k} oczekiwano 6 pol`, line);
    if (p[1] !== 'Fill_W' && p[1] !== 'No_Fill') fail(`Tile ${index}: ${k} fill '${p[1]}'`, line);
    cells[y]![x] = {
      terrain: p[0]!,
      fill: p[1] as TileCell['fill'],
      morning: p[2]!,
      afternoon: p[3]!,
      night: p[4]!,
      encTable: p[5]!,
    };
  }
  const tile: TileDef = {
    index,
    artIdx: num(req('art_idx'), 'art_idx', line),
    encounterDifficulty: num(req('encounter_difficulty'), 'encounter_difficulty', line),
    cells,
  };
  const wm = entries.get('walk_mask_name');
  if (wm !== undefined) tile.walkMaskName = wm;
  return tile;
}

export function parseWorldmapTxt(text: string): WorldmapConfig {
  const cfg: WorldmapConfig = {
    data: {
      frequencies: { Forced: 100, Frequent: 0, Common: 0, Uncommon: 0, Rare: 0, None: 0 },
      terrainTypes: {},
    },
    randomMaps: { Desert: [], Mountain: [], City: [], Ocean: [] },
    encounters: new Map(),
    tables: [],
    tiles: [],
  };
  for (const s of parseIni(text)) {
    const line = s.line;
    let m: RegExpExecArray | null;
    if (s.name === 'Data') {
      for (const f of FREQS) {
        const v = s.entries.get(f);
        if (v !== undefined) cfg.data.frequencies[f] = num(v, f, line);
      }
      for (const p of (s.entries.get('terrain_types') ?? '').split(',')) {
        if (p.trim() === '') continue;
        const { key, val } = keyOf(p);
        const name = p.slice(0, p.indexOf(':')).trim();
        cfg.data.terrainTypes[name || key] = num(val, 'terrain_types', line);
      }
    } else if ((m = /^Random Maps:\s*(\w+)$/i.exec(s.name))) {
      const t = TERRAINS.find((x) => x.toLowerCase() === m![1]!.toLowerCase());
      if (!t) fail(`Random Maps: nieznany teren '${m[1]}'`, line);
      cfg.randomMaps[t!] = [...s.entries.keys()]
        .map((k) => ({ k, m: /^map_(\d+)$/i.exec(k) }))
        .filter((e) => e.m)
        .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
        .map((e) => s.entries.get(e.k)!);
    } else if ((m = /^Encounter Table\s+(\d+)$/i.exec(s.name))) {
      const entries = [...s.entries.keys()]
        .map((k) => ({ k, m: /^enc_(\d+)$/i.exec(k) }))
        .filter((e) => e.m)
        .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
        .map((e) => parseEntry(s.entries.get(e.k)!, line));
      cfg.tables.push({
        index: Number(m[1]),
        lookupName: s.entries.get('lookup_name') ?? '',
        maps: (s.entries.get('maps') ?? '')
          .split(',')
          .map((x) => x.trim())
          .filter((x) => x !== ''),
        entries,
      });
    } else if ((m = /^Encounter:\s*(.+)$/i.exec(s.name))) {
      cfg.encounters.set(m[1]!.trim(), parseEncounter(m[1]!.trim(), s.entries, line));
    } else if ((m = /^Tile\s+(\d+)$/i.exec(s.name))) {
      cfg.tiles.push(parseTile(Number(m[1]), s.entries, line));
    }
  }
  return cfg;
}

/** Wyszukanie encountera bez rozrozniania wielkosci liter (dane odwoluja sie np. `Red_Wolves` do `RED_Wolves`). */
export function findEncounter(cfg: WorldmapConfig, name: string): EncounterDef | undefined {
  const direct = cfg.encounters.get(name);
  if (direct) return direct;
  const lower = name.toLowerCase();
  for (const [k, v] of cfg.encounters) if (k.toLowerCase() === lower) return v;
  return undefined;
}
