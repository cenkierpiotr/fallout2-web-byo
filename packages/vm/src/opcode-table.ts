import { RAW_OPCODES } from './opcode-table.generated.js';

export interface OpcodeDef {
  op: number;
  name: string;
  inlineArg: 'none' | 'i32';
  /** liczba zdejmowanych elementow; -1 = nieznana (spec: `?`) */
  pops: number;
  pushes: 0 | 1;
  kind: 'core' | 'game' | 'sfall';
  status: 'D' | 'W' | 'Z' | 'unknown';
}

/** Opkody Core: 0x8000-0x804B; Game: 0x804C-0x8155; powyzej (sfall) brak w specyfikacji vanilla. */
export function opcodeKind(op: number): OpcodeDef['kind'] {
  return op <= 0x804b ? 'core' : op <= 0x8155 ? 'game' : 'sfall';
}

/** Opkody o indeksie (op & 0x3ff) == 1 niosa 4-bajtowy argument inline BE. */
export function hasInlineArg(op: number): boolean {
  return (op & 0x3ff) === 1;
}

function build(): ReadonlyMap<number, OpcodeDef> {
  const m = new Map<number, OpcodeDef>();
  for (const [op, name, pops, pushes, status] of RAW_OPCODES) {
    m.set(op, {
      op,
      name,
      inlineArg: hasInlineArg(op) ? 'i32' : 'none',
      pops,
      pushes,
      kind: opcodeKind(op),
      status,
    });
  }
  return m;
}

export const OPCODES: ReadonlyMap<number, OpcodeDef> = build();
