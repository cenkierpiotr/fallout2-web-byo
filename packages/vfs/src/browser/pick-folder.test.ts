import { describe, expect, it } from 'vitest';
import { buildDat2 } from '../../../formats/test/build-dat2.js';
import { findGameFiles, folderFromFileList, isGamePath, openModLayersBrowser } from './pick-folder.js';

function mkFile(rel: string, content: string | Uint8Array = 'x'): File {
  const f = new File([content as BlobPart], rel.split('/').pop() as string);
  Object.defineProperty(f, 'webkitRelativePath', { value: rel });
  return f;
}
const list = (...rels: string[]): FileList => {
  const arr = rels.map((r) => mkFile(r));
  return Object.assign(arr, { item: (i: number) => arr[i] ?? null }) as unknown as FileList;
};

describe('folderFromFileList', () => {
  it('usuwa pierwszy segment i normalizuje klucz', () => {
    const f = folderFromFileList(list('Fallout 2/MASTER.DAT'));
    expect(f.kind).toBe('files');
    expect(f.files.has('master.dat')).toBe(true);
  });
});

describe('findGameFiles', () => {
  it('zglasza brak CRITTER.DAT', () => {
    const r = findGameFiles(folderFromFileList(list('F/MASTER.DAT')));
    expect(r.missing).toEqual(['CRITTER.DAT']);
  });
  it('overlay z data/', async () => {
    const r = findGameFiles(
      folderFromFileList(list('F/MASTER.DAT', 'F/CRITTER.DAT', 'F/data/Text/x.msg')),
    );
    expect(r.missing).toEqual([]);
    expect(r.files.overlay?.has('text/x.msg')).toBe(true);
    expect(r.keys.master).toMatch(/^master\.dat:1:\d+$/);
    expect(r.keys.patch).toBeUndefined();
  });
});

describe('openModLayersBrowser', () => {
  it('zwraca null bez modow i rozpoznaje isGamePath dla mods/ oraz ddraw.ini', async () => {
    expect(isGamePath('mods/rpu.dat')).toBe(true);
    expect(isGamePath('ddraw.ini')).toBe(true);
    expect(await openModLayersBrowser(folderFromFileList(list('F/MASTER.DAT', 'F/CRITTER.DAT')))).toBeNull();
  });

  it('laduje warstwy DAT2 z mods/ zgodnie z mods_order.txt', async () => {
    const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
    const dec = (b: Uint8Array): string => new TextDecoder().decode(b);
    const rpuDat = buildDat2([
      { name: 'scripts/abbey.int', data: enc('rpu-script'), compress: false },
    ]);
    const patchDat = buildDat2([
      { name: 'scripts/abbey.int', data: enc('patch-script'), compress: false },
    ]);
    const files = new Map<string, File>([
      ['master.dat', mkFile('F/MASTER.DAT', 'm')],
      ['critter.dat', mkFile('F/CRITTER.DAT', 'c')],
      ['mods/mods_order.txt', mkFile('F/mods/mods_order.txt', 'rpu.dat\nnpc_armor.dat\n')],
      ['mods/rpu.dat', mkFile('F/mods/rpu.dat', rpuDat)],
      ['mods/npc_armor.dat', mkFile('F/mods/npc_armor.dat', patchDat)],
    ]);
    const mods = await openModLayersBrowser({ kind: 'opfs', files });
    expect(mods).not.toBeNull();
    expect(mods!.skipped).toEqual([]);
    expect(mods!.layers.map((l) => l.name)).toEqual(['mods/npc_armor.dat', 'mods/rpu.dat']);
    expect(dec(await mods!.layers[0]!.open('scripts/abbey.int'))).toBe('patch-script');
    await mods!.close();
  });
});
