/**
 * Parser mods_order.txt: lista wpisow (pliki .dat lub katalogi modow), pozniejszy wpis ma wyzszy priorytet.
 * Komentarze: `#`, `;`, `//` (cala linia) oraz ` #` / ` ;` na koncu linii.
 * Duplikaty (bez wielkosci liter, `\` = `/`): zostaje ostatnie wystapienie.
 */
export function parseModsOrder(text: string): string[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const out: string[] = [];
  for (const raw of src.split(/\r\n|\n|\r/)) {
    let line = raw.trim();
    if (line === '' || /^(#|;|\/\/)/.test(line)) continue;
    const c = line.search(/ [#;]/);
    if (c !== -1) line = line.slice(0, c).trim();
    if (line !== '') out.push(line);
  }
  const key = (s: string): string => s.replace(/\\/g, '/').toLowerCase();
  const last = new Map<string, number>();
  out.forEach((s, i) => last.set(key(s), i));
  return out.filter((s, i) => last.get(key(s)) === i);
}
