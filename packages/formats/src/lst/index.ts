/** Parser plikow LST: tekst latin1, jedna pozycja na linie, komentarze po `;`. */

function decodeLatin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return s;
}

/**
 * Indeks tablicy = numer linii. Separatory linii: `\n`, `\r\n` i samotny `\r`.
 * Pusta linia po ostatnim separatorze pomijana; linia ze samych spacji daje wpis `''`.
 * Brak limitu rozmiaru wejscia (pliki LST maja rzad setek KB).
 */
export function parseLst(bytes: Uint8Array): string[] {
  const lines = decodeLatin1(bytes).split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.map((raw) => {
    const semi = raw.indexOf(';');
    return (semi === -1 ? raw : raw.slice(0, semi)).trim();
  });
}

/** Fragment wpisu przed pierwszym przecinkiem (np. `hapowr,21,1` -> `hapowr`). */
export function lstName(entry: string): string {
  const comma = entry.indexOf(',');
  return (comma === -1 ? entry : entry.slice(0, comma)).trim();
}

/**
 * Nazwa pliku wg oryginalnego czytnika LST (0x419664): wiersz do pierwszego znaku z zestawu
 * `" ,;\r\t\n"` (strpbrk, zestaw w 0x5003a0), maks. 12 znakow (strncpy 12, rekord 13 B z NUL).
 * Dla list z danych gry rowna sie `lstName(parseLst(...)[i])` (dokumentacja techniczna).
 */
export function lstNameBinary(line: string): string {
  const m = /[ ,;\r\t\n]/.exec(line);
  return (m ? line.slice(0, m.index) : line).slice(0, 12);
}
