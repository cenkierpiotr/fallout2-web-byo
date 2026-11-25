import { describe, expect, it } from 'vitest';
import { LangPackLayer } from './lang-layer.js';
import { MemoryLayer } from './memory-layer.js';
import { VirtualFs } from './vfs.js';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

const fakeFetch = (files: Record<string, string>, manifest: unknown) => async (url: string) => {
  const body = url.endsWith('/manifest.json') ? JSON.stringify(manifest) : files[url];
  return {
    ok: body !== undefined,
    status: body === undefined ? 404 : 200,
    json: async () => JSON.parse(body ?? 'null') as unknown,
    arrayBuffer: async () => enc(body ?? '').buffer as ArrayBuffer,
  };
};

describe('LangPackLayer', () => {
  it('mapuje text/polish/<x> na plik pakietu (bez wzgledu na wielkosc liter i separator)', async () => {
    const layer = new LangPackLayer({
      list: () => ['game/stat.msg'],
      read: async () => enc('ok'),
    });
    expect(layer.name).toBe('lang-pack:pl');
    expect(layer.has('text/polish/game/stat.msg')).toBe(true);
    expect(layer.has('TEXT\\Polish\\Game\\STAT.MSG')).toBe(true);
    expect(layer.has('text/english/game/stat.msg')).toBe(false);
    expect(new TextDecoder().decode(await layer.open('text/polish/game/stat.msg'))).toBe('ok');
    await expect(layer.open('text/polish/x.msg')).rejects.toThrow('brak pliku');
    expect([...layer.keys()]).toEqual(['text/polish/game/stat.msg']);
  });

  it('fromManifest pobiera manifest i pliki przez fetch', async () => {
    const layer = await LangPackLayer.fromManifest(
      '/lang-packs/pl/',
      fakeFetch(
        { '/lang-packs/pl/dialog/a%20b.msg': 'zażółć' },
        { language: 'pl', files: ['dialog/a b.msg'] },
      ),
    );
    expect(layer.has('text/polish/dialog/a b.msg')).toBe(true);
    expect(new TextDecoder().decode(await layer.open('text/polish/dialog/a b.msg'))).toBe('zażółć');
  });

  it('fromManifest: brak manifestu lub zly manifest -> blad', async () => {
    await expect(LangPackLayer.fromManifest('/x', fakeFetch({}, null))).rejects.toThrow('manifest');
    await expect(
      LangPackLayer.fromManifest('/x', async () => ({
        ok: false,
        status: 404,
        json: async () => null,
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    ).rejects.toThrow('HTTP 404');
  });

  it('fromDirectoryHandle skanuje katalog rekurencyjnie i pomija manifest.json', async () => {
    const file = (s: string) => ({
      kind: 'file' as const,
      getFile: async () => ({ arrayBuffer: async () => enc(s).buffer as ArrayBuffer }),
    });
    const game = {
      kind: 'directory' as const,
      entries: async function* () {
        yield ['stat.msg', file('stat')] as const;
      },
    };
    const root = {
      entries: async function* () {
        yield ['manifest.json', file('{}')] as const;
        yield ['game', game] as const;
      },
    };
    const layer = await LangPackLayer.fromDirectoryHandle(root);
    expect([...layer.keys()]).toEqual(['text/polish/game/stat.msg']);
    expect(new TextDecoder().decode(await layer.open('text/polish/game/stat.msg'))).toBe('stat');
  });

  it('na dole stosu VFS: polski plik z gry ma pierwszenstwo, brakujace pliki dostarcza pakiet', async () => {
    const game = new MemoryLayer('master', new Map([['text/polish/game/stat.msg', enc('gra')]]));
    const pack = new LangPackLayer({
      list: () => ['game/stat.msg', 'game/misc.msg'],
      read: async (rel) => enc(`pakiet:${rel}`),
    });
    const vfs = new VirtualFs([game, pack]);
    expect(vfs.resolve('text/polish/game/stat.msg')?.name).toBe('master');
    expect(vfs.resolve('text/polish/game/misc.msg')?.name).toBe('lang-pack:pl');
  });
});
