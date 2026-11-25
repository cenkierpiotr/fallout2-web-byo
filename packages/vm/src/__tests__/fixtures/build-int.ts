import type { IntScriptLike } from '../../interpreter.js';

/** Pozycja programu testowego: opkod (liczba) lub makro. */
export type Item =
  | number
  | { push: number }
  | { pushf: number }
  | { pushs: string }
  | { label: string }
  /** push int z adresem etykiety (globalnej w skrypcie) */
  | { ref: string };

export interface ProcSpec {
  name: string;
  argc?: number;
  code: Item[];
  /** Domyslnie true: na poczatek ciala wstawiany jest 0x802b (push_frame), jak w kompilatorze. */
  frame?: boolean;
}

export interface BuildOpts {
  /** Poczatkowe wartosci zmiennych skryptu (stos od base18 po preambule). Domyslnie 8 zer. */
  vars?: number[];
  /** Dodatkowe instrukcje wykonywane w preambule (np. export_var 0x8016). */
  init?: Item[];
  /** Dodatkowe wpisy tablicy identyfikatorow po nazwach procedur (testy kolizji id/string). */
  idents?: string[];
}

/** Standardowa sekwencja powrotu (spec int-format.md): wartosc zwrotna musi lezec na szczycie stosu. */
export const RET: readonly number[] = [0x800d, 0x8019, 0x802a, 0x8029, 0x800c, 0x801c];

export interface BuiltScript extends IntScriptLike {
  /** Offset kazdej etykiety (offset pliku). */
  labels: Map<string, number>;
  /** Offset poczatku ciala kolejnych procedur. */
  bodies: number[];
}

const PREAMBLE = 0x2a;
const PROC_TABLE = 0x2e;

function size(it: Item): number {
  if (typeof it === 'number') return 2;
  if ('label' in it) return 0;
  return 6;
}

/** Asembler malych skryptow .INT w pamieci wg dokumentacja techniczna (naglowek, tabele, kod). */
export function buildInt(name: string, specs: ProcSpec[], opts: BuildOpts = {}): BuiltScript {
  const procs = specs.map((p) =>
    p.frame === false ? p : { ...p, code: [0x802b as Item, ...p.code] },
  );
  const n = procs.length;
  const vars = opts.vars ?? [0, 0, 0, 0, 0, 0, 0, 0];
  // blok inicjalizacji jak w prawdziwych skryptach (acklint.int): set_ret_base, zmienne, critical_end, skok do `start`
  const initCode: Item[] = [
    0x802c,
    ...vars.map((v): Item => ({ push: v })),
    0x8003,
    { ref: '__end' },
    0x8004,
    { label: '__end' },
    ...(opts.init ?? []),
    0x802b,
    { push: 0 },
    0x800d,
    0x8019,
    0x802a,
    0x8029,
    0x800c,
    0x801c,
  ];
  // tablica identyfikatorow
  const idParts: number[] = [];
  const nameOffsets: number[] = [];
  for (const p of procs) {
    // loader: start = idOff + nameOff wskazuje na znaki; pole rozmiaru 4 B + u16 len 2 B => +6
    nameOffsets.push(idParts.length + 6);
    const bytes = [...p.name].map((c) => c.charCodeAt(0));
    bytes.push(0);
    idParts.push(bytes.length >> 8, bytes.length & 0xff, ...bytes);
  }
  for (const ident of opts.idents ?? []) {
    const bytes = [...ident].map((c) => c.charCodeAt(0));
    bytes.push(0);
    idParts.push(bytes.length >> 8, bytes.length & 0xff, ...bytes);
  }

  // tablica stringow
  const strings: string[] = [];
  const strOff = new Map<string, number>();
  const strBytes: number[] = [];
  for (const code of [initCode, ...procs.map((p) => p.code)])
    for (const it of code)
      if (typeof it === 'object' && 'pushs' in it && !strOff.has(it.pushs)) {
        strOff.set(it.pushs, strBytes.length + 6);
        strings.push(it.pushs);
        const b = [...it.pushs].map((c) => c.charCodeAt(0));
        b.push(0);
        strBytes.push(b.length >> 8, b.length & 0xff, ...b);
      }

  const idOff = PROC_TABLE + 24 * n;
  const idSize = idParts.length;
  const markerAt = idOff + 4 + idSize;
  const strAt = markerAt + 4;
  const codeOffset = strings.length ? strAt + 4 + strBytes.length + 4 : strAt + 4;

  // adresy
  const labels = new Map<string, number>();
  const bodies: number[] = [];
  let pc = codeOffset;
  const initStart = pc;
  for (const it of initCode) {
    if (typeof it === 'object' && 'label' in it) labels.set(it.label, pc);
    pc += size(it);
  }
  for (const p of procs) {
    bodies.push(pc);
    for (const it of p.code) {
      if (typeof it === 'object' && 'label' in it) labels.set(it.label, pc);
      pc += size(it);
    }
  }
  const total = pc;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  // preambula: critical_begin; push 0x12; data_to_ret; push init; jmp; halt_exit
  dv.setUint16(0, 0x8002);
  dv.setUint16(2, 0xc001);
  dv.setUint32(4, 0x12);
  dv.setUint16(8, 0x800d);
  dv.setUint16(10, 0xc001);
  dv.setUint32(12, initStart);
  dv.setUint16(16, 0x8004);
  dv.setUint16(18, 0x8010);
  for (let o = 20; o < PREAMBLE; o += 2) dv.setUint16(o, 0x8000);
  dv.setUint32(PREAMBLE, n);
  procs.forEach((p, i) => {
    const o = PROC_TABLE + 24 * i;
    dv.setUint32(o, nameOffsets[i]!);
    dv.setUint32(o + 16, bodies[i]!);
    dv.setUint32(o + 20, p.argc ?? 0);
  });
  dv.setUint32(idOff, idSize);
  idParts.forEach((b, i) => dv.setUint8(idOff + 4 + i, b));
  dv.setUint32(markerAt, 0xffffffff);
  if (strings.length) {
    dv.setUint32(strAt, strBytes.length);
    strBytes.forEach((b, i) => dv.setUint8(strAt + 4 + i, b));
    dv.setUint32(strAt + 4 + strBytes.length, 0xffffffff);
  } else {
    dv.setUint32(strAt, 0xffffffff);
  }
  // kod
  let w = codeOffset;
  for (const code of [initCode, ...procs.map((p) => p.code)])
    for (const it of code) {
      if (typeof it === 'number') {
        dv.setUint16(w, it);
        w += 2;
      } else if ('label' in it) {
        // brak bajtow
      } else if ('push' in it) {
        dv.setUint16(w, 0xc001);
        dv.setUint32(w + 2, it.push >>> 0);
        w += 6;
      } else if ('pushf' in it) {
        dv.setUint16(w, 0xa001);
        dv.setFloat32(w + 2, it.pushf);
        w += 6;
      } else if ('pushs' in it) {
        dv.setUint16(w, 0x9001);
        dv.setUint32(w + 2, strOff.get(it.pushs)!);
        w += 6;
      } else {
        const a = labels.get(it.ref);
        if (a === undefined) throw new Error(`brak etykiety ${it.ref}`);
        dv.setUint16(w, 0xc001);
        dv.setUint32(w + 2, a);
        w += 6;
      }
    }

  return {
    name,
    procs: procs.map((p, i) => ({
      name: p.name,
      bodyOffset: bodies[i]!,
      argc: p.argc ?? 0,
      index: i,
    })),
    strings,
    code: dv,
    codeOffset,
    labels,
    bodies,
  };
}
