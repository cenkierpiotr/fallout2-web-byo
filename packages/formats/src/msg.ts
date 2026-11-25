import { FormatError } from './errors.js';

/** Lokalna deklaracja: tsconfig bez DOM/node typow, a TextDecoder jest dostepny w Node i przegladarkach. */
declare const TextDecoder: new (label?: string) => { decode(input: ArrayBuffer): string };

export interface MsgEntry {
  id: number;
  audio: string;
  text: string;
}

export type MsgEncoding = 'windows-1252' | 'windows-1250' | 'utf-8';

/** Limit dlugosci pola wg loadera 0x484fb4 (0x400 znakow). */
const MAX_FIELD = 0x400;

/** Parser liczby 0x484f60: opcjonalny znak i cyfry; cokolwiek innego (w tym puste pole) daje 0. */
function parseNumber(field: string): number {
  return /^[+-]?\d+$/.test(field) ? Number.parseInt(field, 10) | 0 : 0;
}

/**
 * Parser plikow MSG: ciag wpisow `{numer}{audio}{tekst}`. Tekst poza nawiasami (m.in. linie `#`)
 * jest pomijany, LF w polu jest pomijany, CR zostaje. Duplikat id: ostatni wygrywa.
 */
export function parseMsg(
  buf: ArrayBuffer,
  encoding: MsgEncoding = 'windows-1252',
): Map<number, MsgEntry> {
  const s = new TextDecoder(encoding).decode(buf);
  const out = new Map<number, MsgEntry>();
  let pos = 0;

  /** Zwraca pole lub null przy EOF przed polem. */
  const readField = (inEntry: boolean): string | null => {
    const open = s.indexOf('{', pos);
    const stray = s.indexOf('}', pos);
    if (open === -1) {
      if (stray !== -1) throw new FormatError('msg', 'nawias zamykajacy przed otwierajacym', stray);
      if (inEntry) throw new FormatError('msg', 'EOF w srodku wpisu', s.length);
      return null;
    }
    if (stray !== -1 && stray < open)
      throw new FormatError('msg', 'nawias zamykajacy przed otwierajacym', stray);
    const close = s.indexOf('}', open + 1);
    if (close === -1) throw new FormatError('msg', 'EOF w srodku wpisu', s.length);
    const raw = s.slice(open + 1, close).replaceAll('\n', '');
    if (raw.length > MAX_FIELD) throw new FormatError('msg', 'pole dluzsze niz 0x400 znakow', open);
    pos = close + 1;
    return raw;
  };

  for (;;) {
    const num = readField(false);
    if (num === null) break;
    const audio = readField(true);
    const text = readField(true);
    if (audio === null || text === null)
      throw new FormatError('msg', 'EOF w srodku wpisu', s.length);
    const id = parseNumber(num);
    out.set(id, { id, audio, text });
  }
  return out;
}
