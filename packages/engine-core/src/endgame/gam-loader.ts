/** Parser plikow .GAM (globale gry). Spec: dokumentacja techniczna Nigdy nie rzuca. */
export interface GamResult {
  names: string[];
  values: number[];
  warnings: string[];
}

export function parseGam(text: string): GamResult {
  const result: GamResult = { names: [], values: [], warnings: [] };
  const lines = text.split(/\r\n|\r|\n/);
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] ?? '').trim().toLowerCase().startsWith('game_global_vars:')) {
      start = i + 1;
      break;
    }
  }
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    if (raw.trim() === '' || raw.startsWith('//')) continue;
    const line = (raw.split(';')[0] ?? '').trim();
    if (line === '') continue;
    const eq = line.indexOf('=');
    let name = line;
    let valueText = '';
    if (eq !== -1) {
      name = line.slice(0, eq).replace(/:$/, '').trim();
      valueText = line.slice(eq + 1).trim();
    }
    let value = 0;
    if (valueText !== '') {
      const m = /^-?\d+/.exec(valueText);
      if (m) value = parseInt(m[0], 10);
      else result.warnings.push(`linia ${i + 1}: wartosc nie jest liczba: ${valueText}`);
    }
    result.names.push(name);
    result.values.push(value);
  }
  return result;
}
