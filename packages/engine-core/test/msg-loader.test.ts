import { describe, expect, it } from 'vitest';
import { MsgLoader, parseMsgEntries, resolveGameTextLanguage } from '../src/index.js';

type Bytes = Uint8Array;
const utf8 = (s: string): Bytes => new TextEncoder().encode(s);
/** cp1250: tylko znaki uzyte w testach. */
const cp1250 = (s: string): Bytes => {
  const map: Record<string, number> = { ł: 0xb3, ż: 0xbf, ó: 0xf3, ć: 0xe6 };
  return Uint8Array.from([...s].map((c) => map[c] ?? c.charCodeAt(0)));
};
const cp1252 = (s: string): Bytes => {
  const map: Record<string, number> = { é: 0xe9 };
  return Uint8Array.from([...s].map((c) => map[c] ?? c.charCodeAt(0)));
};

function layer(name: string, files: Record<string, Bytes>) {
  return {
    name,
    has: (p: string) => p in files,
    open: async (p: string) => files[p] ?? Promise.reject(new Error(`brak ${p}`)),
  };
}
const src = (...layers: ReturnType<typeof layer>[]) => ({ layers });

const EN = '{100}{}{Strength}\n{101}{}{Perception}\n{102}{}{Endurance}';
const opts = { language: 'polish', fallback: 'english' } as const;

describe('parseMsgEntries', () => {
  it('parsuje wpisy, pomija komentarze i konce linii w polu, ostatni duplikat wygrywa', () => {
    const m = parseMsgEntries('# kom\n{1}{a}{x\ny}\r\n{1}{}{z}{2}{}{w');
    expect(m.get(1)).toEqual({ id: 1, audio: '', text: 'z' });
    expect(m.has(2)).toBe(false);
  });
});

describe('MsgLoader', () => {
  it('pl entry preferred over en', async () => {
    const loader = new MsgLoader(
      src(
        layer('lang-pack:pl', { 'text/polish/game/stat.msg': utf8('{100}{}{Siła}') }),
        layer('master', { 'text/english/game/stat.msg': cp1252(EN) }),
      ),
      opts,
    );
    const t = await loader.load('game/stat');
    expect(loader.text(t, 100)).toBe('Siła');
  });

  it('missing pl id falls back to en entry', async () => {
    const loader = new MsgLoader(
      src(
        layer('lang-pack:pl', { 'text/polish/game/stat.msg': utf8('{100}{}{Siła}') }),
        layer('master', { 'text/english/game/stat.msg': cp1252(EN) }),
      ),
      opts,
    );
    const t = await loader.load('game/stat.msg');
    expect(loader.text(t, 101)).toBe('Perception');
    expect(loader.text(t, 100)).toBe('Siła');
    expect(t.fallbacks).toBe(2);
    expect(t.size).toBe(3);
  });

  it('missing pl file falls back whole file', async () => {
    const loader = new MsgLoader(
      src(layer('master', { 'text/english/dialog/acklint.msg': cp1252('{1}{}{Café}') })),
      opts,
    );
    const t = await loader.load('dialog/acklint');
    expect(loader.text(t, 1)).toBe('Café');
    expect(t.fallbacks).toBe(1);
  });

  it('existing game text/polish layer (cp1250) is not overridden by pack for existing ids', async () => {
    const loader = new MsgLoader(
      src(
        layer('master', { 'text/polish/game/stat.msg': cp1250('{100}{}{Siła z gry ł}') }),
        layer('lang-pack:pl', {
          'text/polish/game/stat.msg': utf8('{100}{}{Siła z pakietu}\n{101}{}{Percepcja}'),
        }),
        layer('master', { 'text/english/game/stat.msg': cp1252(EN) }),
      ),
      opts,
    );
    const t = await loader.load('game/stat');
    expect(loader.text(t, 100)).toBe('Siła z gry ł');
    expect(loader.text(t, 101)).toBe('Percepcja');
    expect(loader.text(t, 102)).toBe('Endurance');
    expect(t.fallbacks).toBe(1);
  });

  it('decodes game polish as cp1250 and pack as utf-8', async () => {
    const loader = new MsgLoader(
      src(layer('master', { 'text/polish/a.msg': cp1250('{1}{}{żółć}') })),
      opts,
    );
    expect(loader.text(await loader.load('a'), 1)).toBe('żółć');
  });

  it('switching language invalidates cache', async () => {
    const loader = new MsgLoader(
      src(
        layer('lang-pack:pl', { 'text/polish/game/stat.msg': utf8('{100}{}{Siła}') }),
        layer('master', { 'text/english/game/stat.msg': cp1252(EN) }),
      ),
      opts,
    );
    const pl = await loader.load('game/stat');
    expect(await loader.load('game/stat')).toBe(pl);
    loader.setLanguage('english');
    expect(loader.generation).toBe(1);
    const en = await loader.load('game/stat');
    expect(en).not.toBe(pl);
    expect(loader.text(en, 100)).toBe('Strength');
    expect(en.fallbacks).toBe(0);
    // tabela wydana wczesniej (dialog w toku) pozostaje w starym jezyku
    expect(loader.text(pl, 100)).toBe('Siła');
    loader.setLanguage('english');
    expect(loader.generation).toBe(1);
  });

  it('brak pliku w obu jezykach -> blad, bez zatrucia cache', async () => {
    const files: Record<string, Bytes> = {};
    const loader = new MsgLoader(src(layer('master', files)), opts);
    await expect(loader.load('x/y')).rejects.toThrow('brak pliku MSG');
    files['text/english/x/y.msg'] = cp1252('{1}{}{ok}');
    expect(loader.text(await loader.load('x/y'), 1)).toBe('ok');
  });

  it('text() zwraca pusty ciag dla nieznanego id', async () => {
    const loader = new MsgLoader(src(layer('m', { 'text/english/a.msg': cp1252('{1}{}{a}') })), {
      language: 'english',
      fallback: 'english',
    });
    expect(loader.text(await loader.load('a'), 9)).toBe('');
  });
});

describe('resolveGameTextLanguage', () => {
  it('auto = jezyk UI', () => {
    expect(resolveGameTextLanguage('auto', 'pl')).toBe('polish');
    expect(resolveGameTextLanguage('auto', 'pl-PL')).toBe('polish');
    expect(resolveGameTextLanguage('auto', 'en')).toBe('english');
    expect(resolveGameTextLanguage('english', 'pl')).toBe('english');
    expect(resolveGameTextLanguage('polish', 'en')).toBe('polish');
  });
});
