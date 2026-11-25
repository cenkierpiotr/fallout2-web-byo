import type { IntScript } from '@f2/formats';
import { OPCODES, hasInlineArg, opcodeKind, type OpcodeDef } from '@f2/vm';

export type DisasmInput = Pick<IntScript, 'name' | 'code' | 'codeOffset'>;

export interface Instr {
  offset: number;
  op: number;
  arg?: number;
  def?: OpcodeDef;
}

/** Rozmiar preambuly (kod wykonywany jako pierwszy, spec int-format.md). */
export const PREAMBLE_SIZE = 0x2a;

function decodeRange(script: DisasmInput, from: number, to: number, out: Instr[]): void {
  const { code } = script;
  let pc = from;
  while (pc < to) {
    if (pc + 2 > to) throw new Error(`${script.name}: ucięty opkod @${pc}`);
    const op = code.getUint16(pc, false);
    if ((op & 0x8000) === 0)
      throw new Error(`${script.name}: brak bitu 0x8000 @${pc} (0x${op.toString(16)})`);
    const def = OPCODES.get(op);
    const instr: Instr = { offset: pc, op };
    if (def) instr.def = def;
    pc += 2;
    if (hasInlineArg(op)) {
      if (pc + 4 > to) throw new Error(`${script.name}: ucięty argument @${pc}`);
      instr.arg = code.getUint32(pc, false);
      pc += 4;
    }
    out.push(instr);
  }
}

/**
 * Dezasembluje liniowo preambule [0, 0x2a) i sekcje kodu [codeOffset, koniec). Offsety = offsety pliku.
 * Pomija tabele (procedur, identyfikatorow, stringow) miedzy nimi. Rzuca przy braku bitu 0x8000 lub uciętym argumencie.
 */
export function disassemble(script: DisasmInput): Instr[] {
  const out: Instr[] = [];
  const pre = Math.min(PREAMBLE_SIZE, script.codeOffset, script.code.byteLength);
  decodeRange(script, 0, pre, out);
  decodeRange(script, script.codeOffset, script.code.byteLength, out);
  return out;
}

export interface OpStat {
  count: number;
  scripts: number;
  name?: string;
}

export function opcodeStats(scripts: DisasmInput[]): {
  byOp: Map<number, OpStat>;
  unknownCore: number[];
} {
  const byOp = new Map<number, OpStat>();
  for (const s of scripts) {
    const seen = new Set<number>();
    for (const i of disassemble(s)) {
      // push-e stalych (C001/9001/A001) licz pod ich jawnym opkodem
      let st = byOp.get(i.op);
      if (!st) {
        st = { count: 0, scripts: 0 };
        const name = i.def?.name ?? pushName(i.op);
        if (name) st.name = name;
        byOp.set(i.op, st);
      }
      st.count++;
      if (!seen.has(i.op)) {
        seen.add(i.op);
        st.scripts++;
      }
    }
  }
  const unknownCore = [...byOp.keys()]
    .filter((op) => !OPCODES.has(op) && !hasInlineArg(op) && opcodeKind(op) === 'core')
    .sort((a, b) => a - b);
  return { byOp, unknownCore };
}

function pushName(op: number): string | undefined {
  if (!hasInlineArg(op)) return undefined;
  switch (op & 0xf000) {
    case 0xc000:
      return 'push_int';
    case 0x9000:
      return 'push_string';
    case 0xa000:
      return 'push_float';
    default:
      return undefined;
  }
}

export function formatInstr(i: Instr): string {
  const off = i.offset.toString(16).padStart(6, '0');
  const name = i.def?.name ?? pushName(i.op) ?? '?';
  const arg = i.arg === undefined ? '' : ` 0x${i.arg.toString(16)}`;
  return `${off}  ${i.op.toString(16).padStart(4, '0')}  ${name}${arg}`;
}

export function opName(op: number, def?: OpcodeDef): string {
  return def?.name ?? pushName(op) ?? '?';
}
