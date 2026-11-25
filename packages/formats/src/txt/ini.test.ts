import { describe, expect, it } from 'vitest';
import { parseIni } from './ini.js';

describe('parseIni', () => {
  it('sekcje, komentarze, nadpisanie klucza', () => {
    const s = parseIni('# c\n[A]\nk=1 ; x\n\n[B]\nk=2\nk=3\n');
    expect(s.map((x) => x.name)).toEqual(['A', 'B']);
    expect(s[0]?.entries.get('k')).toBe('1');
    expect(s[1]?.entries.get('k')).toBe('3');
    expect(s[0]?.line).toBe(2);
    expect(s[1]?.line).toBe(5);
  });
  it('srednik bez spacji zostaje, klucz bez wartosci, CRLF, naglowek z komentarzem', () => {
    const s = parseIni('x=1\r\n[P 0]   ; Player\r\na=b;c\r\nflag\r\n; k=9\r\n');
    expect(s).toHaveLength(1);
    expect(s[0]?.name).toBe('P 0');
    expect(s[0]?.entries.get('a')).toBe('b;c');
    expect(s[0]?.entries.get('flag')).toBe('');
    expect(s[0]?.entries.has('x')).toBe(false);
    expect(s[0]?.entries.has('k')).toBe(false);
  });
  it('pusty tekst', () => {
    expect(parseIni('')).toEqual([]);
  });
});
