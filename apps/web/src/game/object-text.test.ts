import { afterEach, describe, expect, it, vi } from 'vitest';
import { ObjectTextSource, formatLook, httpPackReader, protoMsgFile } from './object-text';

const enc = (s: string, label = 'utf-8'): Uint8Array => {
  if (label === 'utf-8') return new TextEncoder().encode(s);
  // cp1250: tylko znaki uzywane w tescie
  const map: Record<string, number> = { ł: 0xb3, ó: 0xf3, ą: 0xb9, ę: 0xea };
  return Uint8Array.from([...s].map((c) => map[c] ?? c.charCodeAt(0)));
};

const EN_ITEM = '{100}{}{Leather Armor}\n{101}{}{Basic armor.}\n{200}{}{Metal Armor}\n';
const PL_ITEM = '{100}{}{Skórzany pancerz}\n{101}{}{Podstawowy strój.}\n';

function vfsOf(files: Record<string, Uint8Array>) {
  const opened: string[] = [];
  return {
    opened,
    vfs: {
      open: async (p: string) => {
        opened.push(p);
        const f = files[p];
        if (!f) throw new Error(`brak ${p}`);
        return f;
      },
    },
  };
}

describe('protoMsgFile', () => {
  it('mapuje typ obiektu na plik pro_*.msg', () => {
    expect(
      ['item', 'crit', 'scen', 'wall', 'tile', 'misc'].map(
        (n, i) => protoMsgFile(i) === `pro_${n}`,
      ),
    ).toEqual([true, true, true, true, true, true]);
    expect(protoMsgFile(9)).toBeUndefined();
  });
});

describe('ObjectTextSource', () => {
  it('angielski: nazwa=textId, opis=textId+1 z text/english/game/', async () => {
    const { vfs } = vfsOf({ 'text/english/game/pro_item.msg': enc(EN_ITEM) });
    const src = new ObjectTextSource(vfs);
    expect(await src.describe('en', 0, 100)).toEqual({
      name: 'Leather Armor',
      description: 'Basic armor.',
    });
    expect(await src.describe('en', 0, 200)).toEqual({ name: 'Metal Armor', description: '' });
    expect(await src.describe('en', 0, 999)).toBeUndefined();
  });

  it('polski z pakietu (UTF-8) ma pierwszenstwo, braki uzupelnia angielski', async () => {
    const { vfs } = vfsOf({ 'text/english/game/pro_item.msg': enc(EN_ITEM) });
    const src = new ObjectTextSource(vfs, {
      pack: async (rel) => (rel === 'game/pro_item.msg' ? enc(PL_ITEM) : null),
    });
    expect(await src.describe('pl', 0, 100)).toEqual({
      name: 'Skórzany pancerz',
      description: 'Podstawowy strój.',
    });
    expect((await src.describe('pl', 0, 200))?.name).toBe('Metal Armor');
  });

  it('polski z VFS gry (cp1250), gdy brak pakietu', async () => {
    const { vfs } = vfsOf({
      'text/english/game/pro_item.msg': enc(EN_ITEM),
      'text/polish/game/pro_item.msg': enc('{100}{}{Pancerz ł}\n', 'cp1250'),
    });
    const src = new ObjectTextSource(vfs, { pack: async () => null });
    expect((await src.describe('pl', 0, 100))?.name).toBe('Pancerz ł');
  });

  it('polski bez pakietu i bez pliku PL spada na angielski', async () => {
    const { vfs } = vfsOf({ 'text/english/game/pro_item.msg': enc(EN_ITEM) });
    const src = new ObjectTextSource(vfs, { pack: async () => null });
    expect((await src.describe('pl', 0, 100))?.name).toBe('Leather Armor');
  });

  it('cache: ten sam plik czytany raz; zmiana jezyka daje inny tekst', async () => {
    const { vfs, opened } = vfsOf({ 'text/english/game/pro_item.msg': enc(EN_ITEM) });
    const src = new ObjectTextSource(vfs, { pack: async () => enc(PL_ITEM) });
    await src.describe('en', 0, 100);
    await src.describe('en', 0, 200);
    expect(opened.filter((p) => p.includes('english'))).toHaveLength(1);
    expect((await src.describe('pl', 0, 100))?.name).toBe('Skórzany pancerz');
  });

  it('brak plikow i nieznany typ: undefined, bez wyjatku', async () => {
    const { vfs } = vfsOf({});
    const src = new ObjectTextSource(vfs, { pack: async () => null });
    expect(await src.describe('en', 0, 100)).toBeUndefined();
    expect(await src.describe('en', 9, 100)).toBeUndefined();
  });

  it('odpowiedz HTML zamiast pakietu (fallback SPA) jest ignorowana', async () => {
    const { vfs } = vfsOf({ 'text/english/game/pro_item.msg': enc(EN_ITEM) });
    const src = new ObjectTextSource(vfs, {
      pack: async () => enc('<!doctype html><html></html>'),
    });
    expect((await src.describe('pl', 0, 100))?.name).toBe('Leather Armor');
  });
});

describe('formatLook', () => {
  it('nazwa i opis; sam opis pusty to sama nazwa', () => {
    expect(formatLook({ name: 'Nóż', description: 'Ostry.' })).toBe('Nóż. Ostry.');
    expect(formatLook({ name: 'Nóż', description: '' })).toBe('Nóż');
    expect(formatLook({ name: ' ', description: 'x' })).toBe('x');
  });
});

describe('httpPackReader', () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (body: string, init: { ok?: boolean; type?: string }) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: init.ok ?? true,
        headers: new Headers(init.type ? { 'content-type': init.type } : {}),
        arrayBuffer: async () => new TextEncoder().encode(body).buffer,
      })),
    );

  it('zwraca bajty poprawnego pliku', async () => {
    stub('{ID}{100}{}{Nazwa}', { type: 'application/octet-stream' });
    const r = await httpPackReader()('x.msg');
    expect(r && new TextDecoder().decode(r)).toBe('{ID}{100}{}{Nazwa}');
  });
  it('odrzuca text/html (SPA fallback)', async () => {
    stub('<html></html>', { type: 'text/html; charset=utf-8' });
    expect(await httpPackReader()('x.msg')).toBeNull();
  });
  it('odrzuca tresc zaczynajaca sie od doctype/html bez content-type', async () => {
    stub('  <!DOCTYPE html><html>', {});
    expect(await httpPackReader()('x.msg')).toBeNull();
    stub('<HTML>', {});
    expect(await httpPackReader()('x.msg')).toBeNull();
  });
  it('odrzuca !ok', async () => {
    stub('x', { ok: false });
    expect(await httpPackReader()('x.msg')).toBeNull();
  });
});
