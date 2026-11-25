/** Wspolny parser tabel tekstowych z data\ (CSV z komentarzami #). Nigdy nie rzuca. */
export interface TableResult<T> {
  items: T[];
  warnings: string[];
}

export interface ColumnSpec {
  name: string;
  kind: 'int' | 'str';
  optional?: boolean;
}

export type Row = Record<string, number | string> & { line: number };

export function parseCsvTable(text: string, columns: readonly ColumnSpec[]): TableResult<Row> {
  const result: TableResult<Row> = { items: [], warnings: [] };
  const required = columns.filter((c) => !c.optional).length;
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    const hash = lines[i]!.indexOf('#');
    const clean = (hash === -1 ? lines[i]! : lines[i]!.slice(0, hash)).trim();
    if (clean === '') continue;
    const fields = clean.split(',').map((f) => f.trim());
    if (fields.length < required || fields.length > columns.length) {
      result.warnings.push(`linia ${n}: nieprawidlowa liczba pol (${fields.length})`);
      continue;
    }
    const row: Row = { line: n };
    let ok = true;
    for (let j = 0; j < columns.length && ok; j++) {
      const col = columns[j]!;
      const v = fields[j];
      if (v === undefined || v === '') {
        if (!col.optional) {
          result.warnings.push(`linia ${n}: puste pole "${col.name}"`);
          ok = false;
        }
        continue;
      }
      if (col.kind === 'int') {
        if (!/^-?\d+$/.test(v)) {
          result.warnings.push(`linia ${n}: pole "${col.name}" nie jest liczba calkowita`);
          ok = false;
        } else row[col.name] = parseInt(v, 10);
      } else row[col.name] = v;
    }
    if (ok) result.items.push(row);
  }
  return result;
}
