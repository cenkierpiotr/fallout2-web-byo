import { parseCsvTable, type ColumnSpec, type TableResult } from './csv-table.js';

export interface QuestTableDef {
  locationMsg: number;
  descriptionMsg: number;
  gvar: number;
  displayThreshold: number;
  completedThreshold: number;
  line: number;
}

const COLUMNS: ColumnSpec[] = [
  { name: 'locationMsg', kind: 'int' },
  { name: 'descriptionMsg', kind: 'int' },
  { name: 'gvar', kind: 'int' },
  { name: 'displayThreshold', kind: 'int' },
  { name: 'completedThreshold', kind: 'int' },
];

export function parseQuestsTable(text: string): TableResult<QuestTableDef> {
  const r = parseCsvTable(text, COLUMNS);
  return { items: r.items as unknown as QuestTableDef[], warnings: r.warnings };
}
