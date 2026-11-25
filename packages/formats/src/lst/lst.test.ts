import { describe, expect, it } from 'vitest';
import { lstName, lstNameBinary, parseLst } from './index.js';

const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe('parseLst', () => {
  it('usuwa CR, komentarze i trim', () => {
    expect(parseLst(latin1('a.frm\r\nb.frm ; komentarz\r\n'))).toEqual(['a.frm', 'b.frm']);
  });
  it('zachowuje puste linie w srodku, pomija koncowa', () => {
    expect(parseLst(latin1('a\n\nb\n'))).toEqual(['a', '', 'b']);
  });
  it('bez koncowego newline', () => {
    expect(parseLst(latin1('a\nb'))).toEqual(['a', 'b']);
  });
  it('pusty plik', () => {
    expect(parseLst(new Uint8Array())).toEqual([]);
  });
  it('linia z samym komentarzem daje pusty string', () => {
    expect(parseLst(latin1('; x\na\n'))).toEqual(['', 'a']);
  });
  it('samotny CR jest separatorem linii (nie skleja)', () => {
    expect(parseLst(latin1('a\rb\r'))).toEqual(['a', 'b']);
    expect(parseLst(latin1('a\rb\r\nc\n'))).toEqual(['a', 'b', 'c']);
  });
  it('linia ze samych spacji daje pusty wpis, takze ostatnia bez newline', () => {
    expect(parseLst(latin1('a\n   \nb\n'))).toEqual(['a', '', 'b']);
    expect(parseLst(latin1('a\n  '))).toEqual(['a', '']);
  });
  it('znaki latin1 > 0x7f', () => {
    expect(parseLst(Uint8Array.of(0xe9, 0x0a))).toEqual(['é']);
  });
});

describe('lstName', () => {
  it('zwraca fragment przed przecinkiem', () => {
    expect(lstName('hapowr,21,1')).toBe('hapowr');
    expect(lstName('plain')).toBe('plain');
  });
});

describe('lstNameBinary', () => {
  it('tnie na spacji, przecinku, sredniku tabulatorze oraz do 12 znakow', () => {
    expect(lstNameBinary('hapowr,21,1')).toBe('hapowr');
    expect(lstNameBinary('abc def')).toBe('abc');
    expect(lstNameBinary('abc\tdef')).toBe('abc');
    expect(lstNameBinary('abc;kom')).toBe('abc');
    expect(lstNameBinary('abcdefghijklmnop')).toBe('abcdefghijkl');
    expect(lstNameBinary('')).toBe('');
  });
});
