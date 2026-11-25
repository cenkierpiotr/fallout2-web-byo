import { parseCsvTable, type ColumnSpec, type TableResult } from './csv-table.js';

export interface EndgameSlide {
  gvar: number;
  value: number;
  art: number;
  narrator: string;
  direction: -1 | 0 | 1;
  line: number;
}

const COLUMNS: ColumnSpec[] = [
  { name: 'gvar', kind: 'int' },
  { name: 'value', kind: 'int' },
  { name: 'art', kind: 'int' },
  { name: 'narrator', kind: 'str' },
  { name: 'direction', kind: 'int', optional: true },
];

export function parseEndgameTable(text: string): TableResult<EndgameSlide> {
  const r = parseCsvTable(text, COLUMNS);
  const items: EndgameSlide[] = [];
  const warnings = [...r.warnings];
  for (const it of r.items) {
    const d = (it.direction as number | undefined) ?? 0;
    if (d !== -1 && d !== 0 && d !== 1) {
      warnings.push(`linia ${it.line}: kierunek musi byc -1, 0 lub 1`);
      continue;
    }
    items.push({
      gvar: it.gvar as number,
      value: it.value as number,
      art: it.art as number,
      narrator: it.narrator as string,
      direction: d,
      line: it.line,
    });
  }
  return { items, warnings };
}
