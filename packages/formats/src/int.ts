import { FormatError } from './errors.js';

export interface ProcInfo {
  name: string;
  flags: number;
  delay: number;
  condOffset: number;
  bodyOffset: number;
  argc: number;
  index: number;
}

/** Flagi procedur (dokumentacja techniczna 0x04 import i 0x10 krytyczna D, reszta W). */
export const ProcFlags: Readonly<
  Record<'timed' | 'conditional' | 'import' | 'export' | 'critical', number>
> = {
  timed: 0x01,
  conditional: 0x02,
  import: 0x04,
  export: 0x08,
  critical: 0x10,
};

export interface IntScript {
  name: string;
  procs: ProcInfo[];
  identifiers: string[];
  strings: string[];
  /** Caly plik: offsety (bodyOffset, pc) sa offsetami w tym widoku. */
  code: DataView;
  /** Offset poczatku sekcji kodu (po tablicy stringow). */
  codeOffset: number;
  procByName: Map<string, ProcInfo>;
}

/** Indeks -> nazwa procedury systemowej (spec int-format.md, 28 slotow; 9, 10, 19, 20 = none_x_bad). */
export const SYSTEM_PROCS: readonly string[] = [
  'no_p_proc',
  'start',
  'spatial_p_proc',
  'description_p_proc',
  'pickup_p_proc',
  'drop_p_proc',
  'use_p_proc',
  'use_obj_on_p_proc',
  'use_skill_on_p_proc',
  'none_x_bad',
  'none_x_bad',
  'talk_p_proc',
  'critter_p_proc',
  'combat_p_proc',
  'damage_p_proc',
  'map_enter_p_proc',
  'map_exit_p_proc',
  'create_p_proc',
  'destroy_p_proc',
  'none_x_bad',
  'none_x_bad',
  'look_at_p_proc',
  'timed_event_p_proc',
  'map_update_p_proc',
  'push_p_proc',
  'is_dropping_p_proc',
  'combat_is_starting_p_proc',
  'combat_is_over_p_proc',
];

const HEADER_PROCS = 0x2a;
const PROC_TABLE = 0x2e;
const PROC_ENTRY = 24;

function decodeCString(bytes: Uint8Array): string {
  let end = bytes.indexOf(0);
  if (end < 0) end = bytes.length;
  let s = '';
  for (let i = 0; i < end; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

/** Tablica: u32 size + wpisy (u16 len + len znakow). Zwraca wpisy i offset za tablica. */
function readNameTable(
  view: DataView,
  bytes: Uint8Array,
  at: number,
): { items: string[]; end: number } {
  if (at + 4 > view.byteLength) throw new FormatError('int', 'ucieta tablica nazw', at);
  const size = view.getUint32(at);
  const end = at + 4 + size;
  if (end > view.byteLength) throw new FormatError('int', 'tablica nazw poza plikiem', at);
  const items: string[] = [];
  let p = at + 4;
  while (p + 2 <= end) {
    const len = view.getUint16(p);
    p += 2;
    if (p + len > end) throw new FormatError('int', 'wpis nazwy poza tablica', p);
    items.push(decodeCString(bytes.subarray(p, p + len)));
    p += len;
  }
  return { items, end };
}

export function parseInt(buf: ArrayBuffer, name: string): IntScript {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  if (view.byteLength < PROC_TABLE) throw new FormatError('int', 'plik za krotki', 0);
  if (view.getUint16(0) !== 0x8002)
    throw new FormatError('int', 'preambula nie zaczyna sie od 0x8002', 0);
  const n = view.getUint32(HEADER_PROCS);
  const idOff = PROC_TABLE + PROC_ENTRY * n;
  if (!Number.isSafeInteger(idOff) || idOff + 4 > view.byteLength) {
    throw new FormatError('int', 'tabela procedur poza plikiem', HEADER_PROCS);
  }

  const ids = readNameTable(view, bytes, idOff);
  const markerAt = ids.end;
  if (markerAt + 4 > view.byteLength || view.getUint32(markerAt) !== 0xffffffff) {
    throw new FormatError('int', 'brak znacznika 0xFFFFFFFF po identyfikatorach', markerAt);
  }
  const strAt = markerAt + 4;
  if (strAt + 4 > view.byteLength) throw new FormatError('int', 'ucieta tablica stringow', strAt);
  let strings: string[] = [];
  let codeOffset: number;
  if (view.getUint32(strAt) === 0xffffffff) {
    codeOffset = strAt + 4;
  } else {
    const t = readNameTable(view, bytes, strAt);
    strings = t.items;
    codeOffset = t.end + 4; // koncowy znacznik 0xFFFFFFFF
    if (codeOffset > view.byteLength)
      throw new FormatError('int', 'ucieta tablica stringow', t.end);
  }

  const procs: ProcInfo[] = [];
  const procByName = new Map<string, ProcInfo>();
  for (let i = 0; i < n; i++) {
    const o = PROC_TABLE + PROC_ENTRY * i;
    const nameOff = view.getUint32(o);
    const start = idOff + nameOff;
    if (nameOff < 6 || start >= view.byteLength)
      throw new FormatError('int', 'zly offset nazwy procedury', o);
    const len = view.getUint16(start - 2);
    const pname = decodeCString(bytes.subarray(start, Math.min(start + len, markerAt)));
    const p: ProcInfo = {
      name: pname,
      flags: view.getUint32(o + 4),
      delay: view.getUint32(o + 8),
      condOffset: view.getUint32(o + 12),
      bodyOffset: view.getUint32(o + 16),
      argc: view.getUint32(o + 20),
      index: i,
    };
    procs.push(p);
    if (!procByName.has(pname)) procByName.set(pname, p);
  }

  return { name, procs, identifiers: ids.items, strings, code: view, codeOffset, procByName };
}
