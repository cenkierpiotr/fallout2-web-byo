import { readFileSync, writeFileSync } from 'node:fs';

export interface RawOpcodeRow {
  op: number;
  name: string;
  pops: number;
  pushes: 0 | 1;
  status: 'D' | 'W' | 'Z';
}

const ROW =
  /^\|\s*0x([0-9a-fA-F]{4})\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|[^|]*\|[^|]*\|\s*([DWZ])\s*\|\s*$/;

/** Parsuje tabele opkodow Core i Game z int-opcodes.md (wiersze `| 0x80xx | ...`). */
export function parseOpcodeSpec(md: string): RawOpcodeRow[] {
  const rows: RawOpcodeRow[] = [];
  for (const line of md.split('\n')) {
    if (!/^\|\s*0x8[01][0-9a-f]{2}\s*\|/i.test(line)) continue;
    const m = ROW.exec(line);
    if (!m) throw new Error(`nierozpoznany wiersz: ${line}`);
    const op = parseInt(m[1] as string, 16);
    let name = m[2] as string;
    if (name === '(bez nazwy)' || name === '') name = `op_${(m[1] as string).toLowerCase()}`;
    const argc = m[3] as string;
    const eff = /^(\?|\d+)->(\?|\d+)$/.exec(m[5] as string);
    if (!eff) throw new Error(`nierozpoznany efekt: ${line}`);
    const pops = eff[1] === '?' ? -1 : Number(eff[1]);
    const pushes: 0 | 1 = eff[2] === '1' ? 1 : 0;
    void argc;
    rows.push({ op, name, pops, pushes, status: m[6] as 'D' | 'W' | 'Z' });
  }
  return rows;
}

export function renderOpcodeTable(rows: RawOpcodeRow[]): string {
  const lines = rows.map(
    (r) =>
      `  [0x${r.op.toString(16)}, ${JSON.stringify(r.name)}, ${r.pops}, ${r.pushes}, '${r.status}'],`,
  );
  return (
    '// WYGENEROWANE przez `pnpm tools gen-opcodes` z docs/specs/int-opcodes.md. Nie edytuj recznie.\n' +
    "export type RawOpcode = readonly [op: number, name: string, pops: number, pushes: 0 | 1, status: 'D' | 'W' | 'Z'];\n" +
    'export const RAW_OPCODES: readonly RawOpcode[] = [\n' +
    lines.join('\n') +
    '\n];\n'
  );
}

export function genOpcodes(specPath: string, outPath: string): number {
  const rows = parseOpcodeSpec(readFileSync(specPath, 'utf8'));
  writeFileSync(outPath, renderOpcodeTable(rows));
  return rows.length;
}
