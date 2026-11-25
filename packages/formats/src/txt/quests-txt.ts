/** Parsery plikow CSV-like: quests.txt, holodisk.txt. */

/** Wiersze liczb calkowitych rozdzielonych przecinkami; pomija puste i komentarze `#`/`;`. */
export function parseCsvLines(text: string): number[][] {
  const out: number[][] = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = (lines[i] ?? '').trim();
    const c = line.search(/[#;]/);
    if (c !== -1) line = line.slice(0, c).trim();
    if (line === '') continue;
    out.push(
      line.split(',').map((part) => {
        const v = part.trim();
        const n = Number(v);
        if (v === '' || !Number.isInteger(n))
          throw new Error(`linia ${i + 1}: nieprawidlowa liczba '${v}'`);
        return n;
      }),
    );
  }
  return out;
}

/** Wiersze z dokladnie wymagana liczba kolumn (dodatkowe ignorowane), z numerem wiersza w bledzie. */
export function csvRows(text: string, cols: number, what: string): number[][] {
  return parseCsvLines(text).map((row, i) => {
    if (row.length < cols)
      throw new Error(`${what}: wiersz ${i + 1} ma ${row.length} kolumn, oczekiwano ${cols}`);
    return row;
  });
}

export interface QuestDef {
  locationMsg: number;
  descriptionMsg: number;
  gvar: number;
  displayThreshold: number;
  completedThreshold: number;
}

export function parseQuestsTxt(text: string): QuestDef[] {
  return csvRows(text, 5, 'quests.txt').map((r) => ({
    locationMsg: r[0] as number,
    descriptionMsg: r[1] as number,
    gvar: r[2] as number,
    displayThreshold: r[3] as number,
    completedThreshold: r[4] as number,
  }));
}

export interface HolodiskDef {
  gvar: number;
  titleMsg: number;
  textMsg: number;
}

export function parseHolodiskTxt(text: string): HolodiskDef[] {
  return csvRows(text, 3, 'holodisk.txt').map((r) => ({
    gvar: r[0] as number,
    titleMsg: r[1] as number,
    textMsg: r[2] as number,
  }));
}
