import { parseCsvTable, type ColumnSpec, type TableResult } from './csv-table.js';

export interface DeathSlide {
  gvar: number;
  value: number;
  areaKnown: number;
  areaNotKnown: number;
  minLevel: number;
  chance: number;
  narrator: string;
  line: number;
}

const COLUMNS: ColumnSpec[] = [
  { name: 'gvar', kind: 'int' },
  { name: 'value', kind: 'int' },
  { name: 'areaKnown', kind: 'int' },
  { name: 'areaNotKnown', kind: 'int' },
  { name: 'minLevel', kind: 'int' },
  { name: 'chance', kind: 'int' },
  { name: 'narrator', kind: 'str' },
];

export function parseEnddeathTable(text: string): TableResult<DeathSlide> {
  const r = parseCsvTable(text, COLUMNS);
  return { items: r.items as unknown as DeathSlide[], warnings: r.warnings };
}
