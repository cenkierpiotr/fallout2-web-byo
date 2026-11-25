import { describe, expect, it } from 'vitest';
import { FormatError } from '../errors.js';
import { parseMsg } from '../msg.js';
import { openGameFolderNode } from '../../../vfs/src/node.js';

const dir = process.env.F2_GAME_DIR;
const patchDir = process.env.F2_PATCH_DIR;

function bytes(...parts: (string | number[])[]): ArrayBuffer {
  const arr: number[] = [];
  for (const p of parts) {
    if (typeof p === 'string') for (const c of p) arr.push(c.charCodeAt(0));
    else arr.push(...p);
  }
  return Uint8Array.from(arr).buffer as ArrayBuffer;
}

describe('parseMsg (syntetyczne)', () => {
  it('test_parseMsg_handles_multiline_and_comments', () => {
    const m = parseMsg(
      bytes('# komentarz bez nawiasow\r\n{100}{a01}{linia1\r\nlinia2}\r\n\r\n#x\r\n{101}{}{b}\r\n'),
    );
    expect([...m.keys()]).toEqual([100, 101]);
    expect(m.get(100)).toEqual({ id: 100, audio: 'a01', text: 'linia1\rlinia2' });
    expect(m.get(101)?.text).toBe('b');
  });
  it('test_parseMsg_cp1252_apostrophe', () => {
    const m = parseMsg(bytes('{1}{}{it', [0x92], 's}'));
    expect(m.get(1)?.text).toBe('it’s');
  });
  it('test_parseMsg_missing_id_returns_undefined', () => {
    expect(parseMsg(bytes('{1}{}{x}')).get(2)).toBeUndefined();
  });
  it('duplikat id: ostatni wygrywa; nie-liczba daje 0; znak', () => {
    const m = parseMsg(bytes('{5}{}{a}{5}{}{b}{abc}{}{z}{-3}{}{n}{+4}{}{p}'));
    expect(m.get(5)?.text).toBe('b');
    expect(m.get(0)?.text).toBe('z');
    expect(m.get(-3)?.text).toBe('n');
    expect(m.get(4)?.text).toBe('p');
  });
  it('pusty plik i sam komentarz', () => {
    expect(parseMsg(bytes('')).size).toBe(0);
    expect(parseMsg(bytes('# tylko\r\n')).size).toBe(0);
  });
  it('bledy: } przed {, EOF w srodku wpisu, pole > 0x400', () => {
    expect(() => parseMsg(bytes('}{1}{}{x}'))).toThrow(FormatError);
    expect(() => parseMsg(bytes('{1}{}'))).toThrow(FormatError);
    expect(() => parseMsg(bytes('{1}{}{abc'))).toThrow(FormatError);
    expect(() => parseMsg(bytes('{1}{}{' + 'x'.repeat(0x401) + '}'))).toThrow(FormatError);
    expect(parseMsg(bytes('{1}{}{' + 'x'.repeat(0x400) + '}')).get(1)?.text.length).toBe(0x400);
  });
  it('kodowanie utf-8 i windows-1250', () => {
    expect(parseMsg(bytes('{1}{}{', [0xc5, 0x82], '}'), 'utf-8').get(1)?.text).toBe('ł');
    expect(parseMsg(bytes('{1}{}{', [0xb3], '}'), 'windows-1250').get(1)?.text).toBe('ł');
  });
});

describe.skipIf(!dir || !patchDir)('parseMsg na prawdziwych danych', () => {
  it('test_parseMsg_acklint_100_text', async () => {
    const vfs = await openGameFolderNode(dir!, patchDir);
    try {
      const b = await vfs.open('text/english/dialog/acklint.msg');
      const m = parseMsg(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
      expect(m.get(100)?.text).toBe('You see Klint, a fellow tribesman.');
    } finally {
      await vfs.close();
    }
  }, 60_000);
});
