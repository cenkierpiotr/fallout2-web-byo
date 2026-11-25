import { FormatError } from '../errors.js';
import { parseIni } from './ini.js';

export interface MapDef {
  index: number;
  lookupName: string;
  mapName: string;
  music?: string;
  ambientSfx: { name: string; weight: number }[];
  saved: boolean;
  deadBodiesAge: boolean;
  canRestHere: [boolean, boolean, boolean];
  randomStartPoints: { elevation: number; tileNum: number }[];
  pipboyActive: boolean;
  state?: 'On' | 'Off';
}

const fail = (msg: string, line?: number): never => {
  throw new FormatError('maps.txt', msg, line);
};

function yesNo(value: string, key: string, line: number): boolean {
  const v = value.trim().toLowerCase();
  if (v === 'yes') return true;
  if (v === 'no') return false;
  return fail(`${key}: oczekiwano Yes/No, jest '${value}'`, line);
}

function parseAmbient(value: string, line: number): { name: string; weight: number }[] {
  // brak przecinka w danych ("animal:15 animal:10"): separatorem sa przecinki i biale znaki
  return value
    .split(/[\s,]+/)
    .filter((p) => p !== '')
    .map((p) => {
      const m = /^([^:]+):(\d+)$/.exec(p);
      if (!m) return fail(`ambient_sfx: zly wpis '${p}'`, line);
      return { name: m[1]!, weight: Number(m[2]) };
    });
}

function parseStart(value: string, line: number): { elevation: number; tileNum: number } {
  const m = /^elev:\s*(-?\d+)\s*,\s*tile_num:\s*(-?\d+)$/i.exec(value.trim());
  if (!m) return fail(`random_start_point: zly format '${value}'`, line);
  return { elevation: Number(m[1]), tileNum: Number(m[2]) };
}

export function parseMapsTxt(text: string): MapDef[] {
  const out: MapDef[] = [];
  for (const s of parseIni(text)) {
    const m = /^Map\s+(\d+)$/i.exec(s.name);
    if (!m) continue;
    const line = s.line;
    if (Number(m[1]) !== out.length) fail(`[${s.name}]: oczekiwano indeksu ${out.length}`, line);
    const g = (k: string): string | undefined => s.entries.get(k);
    const req = (k: string): string => g(k) ?? fail(`[${s.name}]: brak klucza ${k}`, line);
    let canRest: [boolean, boolean, boolean] = [false, false, false];
    const cr = g('can_rest_here');
    if (cr !== undefined) {
      const p = cr.split(',');
      if (p.length !== 3) fail('can_rest_here: oczekiwano 3 wartosci', line);
      canRest = [
        yesNo(p[0]!, 'can_rest_here', line),
        yesNo(p[1]!, 'can_rest_here', line),
        yesNo(p[2]!, 'can_rest_here', line),
      ];
    }
    const starts = [...s.entries.keys()]
      .map((k) => ({ k, m: /^random_start_point_(\d+)$/i.exec(k) }))
      .filter((e) => e.m)
      .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
      .map((e) => parseStart(s.entries.get(e.k)!, line));
    const def: MapDef = {
      index: out.length,
      lookupName: req('lookup_name'),
      mapName: req('map_name'),
      ambientSfx: g('ambient_sfx') === undefined ? [] : parseAmbient(g('ambient_sfx')!, line),
      saved: g('saved') === undefined ? false : yesNo(g('saved')!, 'saved', line),
      deadBodiesAge:
        g('dead_bodies_age') === undefined
          ? true
          : yesNo(g('dead_bodies_age')!, 'dead_bodies_age', line),
      canRestHere: canRest,
      randomStartPoints: starts,
      pipboyActive:
        g('pipboy_active') === undefined ? true : yesNo(g('pipboy_active')!, 'pipboy_active', line),
    };
    const music = g('music');
    if (music !== undefined) def.music = music;
    const st = g('state')?.trim().toLowerCase();
    if (st !== undefined) {
      if (st !== 'on' && st !== 'off') fail(`state: '${st}'`, line);
      def.state = st === 'on' ? 'On' : 'Off';
    }
    out.push(def);
  }
  return out;
}
