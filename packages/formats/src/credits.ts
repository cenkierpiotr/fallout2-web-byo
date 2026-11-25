/** Wiersz napisow koncowych (credits.txt / quotes.txt), wg FUN_0042ce6c (specyfikacja formatu R22). */
export interface CreditsLine {
  /** section = '#' (font 104, kolor wariantu), title = '@' (font 103), name = zwykly, blank = odstep */
  kind: 'section' | 'title' | 'name' | 'blank';
  text: string;
}

/** Wiersze z ';' pomijane; '@'/'#' to prefiks stylu (tekst = reszta); pusty wiersz = odstep. */
export function parseCredits(text: string): CreditsLine[] {
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const out: CreditsLine[] = [];
  for (const raw of lines) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.startsWith(';')) continue;
    if (line === '') out.push({ kind: 'blank', text: '' });
    else if (line.startsWith('@')) out.push({ kind: 'title', text: line.slice(1) });
    else if (line.startsWith('#')) out.push({ kind: 'section', text: line.slice(1) });
    else out.push({ kind: 'name', text: line });
  }
  return out;
}
