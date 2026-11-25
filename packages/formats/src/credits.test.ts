import { describe, expect, it } from 'vitest';
import { parseCredits } from './credits.js';

describe('parseCredits', () => {
  it('rozpoznaje @, #, zwykle i puste wiersze (CRLF)', () => {
    const t = '#PROG\r\n\r\n@Lead\r\nJesse\r\n; komentarz\r\nTim';
    expect(parseCredits(t)).toEqual([
      { kind: 'section', text: 'PROG' },
      { kind: 'blank', text: '' },
      { kind: 'title', text: 'Lead' },
      { kind: 'name', text: 'Jesse' },
      { kind: 'name', text: 'Tim' },
    ]);
  });
  it('LF i brak koncowego newline', () => {
    expect(parseCredits('@A\nB\n')).toEqual([
      { kind: 'title', text: 'A' },
      { kind: 'name', text: 'B' },
    ]);
  });
  it('pusty tekst', () => {
    expect(parseCredits('')).toEqual([]);
  });
});
