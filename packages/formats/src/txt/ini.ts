/** Wspolny parser plikow INI-like gry (AI.TXT, party.txt, WORLDMAP.TXT, CITY.TXT, MAPS.TXT). */

export interface IniSection {
  name: string;
  entries: Map<string, string>;
  /** Numer linii naglowka sekcji (od 1). */
  line: number;
}

/** Obcina komentarz inline: `;` poprzedzony bialym znakiem (cala linia z `;` obslugiwana wczesniej). */
function stripInlineComment(s: string): string {
  const m = /\s;/.exec(s);
  return m ? s.slice(0, m.index) : s;
}

/**
 * Komentarze: linie zaczynajace sie od `;` lub `#`; inline tylko `;` po spacji.
 * Klucz bez `=` ma wartosc ''. Powtorzony klucz nadpisuje. Wpisy przed pierwsza sekcja pomijane.
 */
export function parseIni(text: string): IniSection[] {
  const sections: IniSection[] = [];
  let cur: IniSection | undefined;
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (line === '' || line.startsWith(';') || line.startsWith('#')) continue;
    if (line.startsWith('[')) {
      const end = line.indexOf(']');
      if (end > 0) {
        cur = { name: line.slice(1, end).trim(), entries: new Map(), line: i + 1 };
        sections.push(cur);
        continue;
      }
    }
    if (!cur) continue;
    const body = stripInlineComment(line);
    const eq = body.indexOf('=');
    const key = (eq === -1 ? body : body.slice(0, eq)).trim();
    if (key === '') continue;
    cur.entries.set(key, eq === -1 ? '' : body.slice(eq + 1).trim());
  }
  return sections;
}
