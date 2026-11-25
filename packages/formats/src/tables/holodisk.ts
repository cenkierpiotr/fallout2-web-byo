import { parseCsvTable, type ColumnSpec, type TableResult } from './csv-table.js';

export interface HolodiskTableDef {
  gvar: number;
  titleMsg: number;
  textMsg: number;
  line: number;
}

const COLUMNS: ColumnSpec[] = [
  { name: 'gvar', kind: 'int' },
  { name: 'titleMsg', kind: 'int' },
  { name: 'textMsg', kind: 'int' },
];

export function parseHolodiskTable(text: string): TableResult<HolodiskTableDef> {
  const r = parseCsvTable(text, COLUMNS);
  return { items: r.items as unknown as HolodiskTableDef[], warnings: r.warnings };
}
