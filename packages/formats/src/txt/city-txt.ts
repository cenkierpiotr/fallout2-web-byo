import { FormatError } from '../errors.js';
import { parseIni } from './ini.js';

export interface EntranceDef {
  state: 'On' | 'Off';
  x: number;
  y: number;
  mapLookupName: string;
  elevation: number;
  tileNum: number;
  orientation: number;
}

export interface AreaDef {
  index: number;
  name: string;
  worldPos: { x: number; y: number };
  startState: 'On' | 'Off';
  lockState?: 'On' | 'Off';
  size: 'Small' | 'Medium' | 'Large';
  townmapArtIdx: number;
  townmapLabelArtIdx: number;
  entrances: EntranceDef[];
}

const fail = (msg: string, line?: number): never => {
  throw new FormatError('city.txt', msg, line);
};

function onOff(value: string, key: string, line: number): 'On' | 'Off' {
  const v = value.trim().toLowerCase();
  if (v === 'on') return 'On';
  if (v === 'off') return 'Off';
  return fail(`${key}: oczekiwano On/Off, jest '${value}'`, line);
}

function int(value: string, key: string, line: number): number {
  const t = value.trim();
  const n = Number(t);
  if (t === '' || !Number.isInteger(n))
    return fail(`${key}: oczekiwano liczby calkowitej, jest '${value}'`, line);
  return n;
}

function parseEntrance(value: string, key: string, line: number): EntranceDef {
  const p = value.split(',').map((s) => s.trim());
  // 2 wpisy w CITY.TXT maja 8 pol (zbedne pole na koncu): silnik czyta sekwencyjnie, nadmiar ignorujemy.
  if (p.length < 7) return fail(`${key}: oczekiwano 7 pol, jest ${p.length}`, line);
  return {
    state: onOff(p[0]!, key, line),
    x: int(p[1]!, key, line),
    y: int(p[2]!, key, line),
    mapLookupName: p[3]!,
    elevation: int(p[4]!, key, line),
    tileNum: int(p[5]!, key, line),
    orientation: int(p[6]!, key, line),
  };
}

export function parseCityTxt(text: string): AreaDef[] {
  const out: AreaDef[] = [];
  for (const s of parseIni(text)) {
    const m = /^Area\s+(\d+)$/i.exec(s.name);
    if (!m) continue;
    const line = s.line;
    if (Number(m[1]) !== out.length) fail(`[${s.name}]: oczekiwano indeksu ${out.length}`, line);
    const req = (k: string): string =>
      s.entries.get(k) ?? fail(`[${s.name}]: brak klucza ${k}`, line);
    const pos = req('world_pos').split(',');
    if (pos.length !== 2) fail('world_pos: oczekiwano x,y', line);
    const sz = req('size').trim().toLowerCase();
    if (sz !== 'small' && sz !== 'medium' && sz !== 'large') fail(`size: '${sz}'`, line);
    const entrances = [...s.entries.keys()]
      .map((k) => ({ k, m: /^entrance_(\d+)$/i.exec(k) }))
      .filter((e) => e.m)
      .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
      .map((e) => parseEntrance(s.entries.get(e.k)!, e.k, line));
    const area: AreaDef = {
      index: out.length,
      name: req('area_name'),
      worldPos: { x: int(pos[0]!, 'world_pos', line), y: int(pos[1]!, 'world_pos', line) },
      startState: onOff(req('start_state'), 'start_state', line),
      size: (sz[0]!.toUpperCase() + sz.slice(1)) as AreaDef['size'],
      townmapArtIdx: int(req('townmap_art_idx'), 'townmap_art_idx', line),
      townmapLabelArtIdx: int(req('townmap_label_art_idx'), 'townmap_label_art_idx', line),
      entrances,
    };
    const lock = s.entries.get('lock_state');
    if (lock !== undefined) area.lockState = onOff(lock, 'lock_state', line);
    out.push(area);
  }
  return out;
}
