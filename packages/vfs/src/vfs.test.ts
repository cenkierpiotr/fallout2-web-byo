import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bufferSource } from '@f2/formats';
import { describe, expect, it, vi } from 'vitest';
import { buildDat2 } from '../../formats/test/build-dat2.js';
import { Dat2Layer } from './dat2-layer.js';
import { openGameFolder } from './game-folder.js';
import type { IndexCache } from './game-folder.js';
import { MemoryLayer } from './memory-layer.js';
import { openGameFolderNode } from './node.js';
import { VirtualFs } from './vfs.js';

const b = (s: string): Uint8Array => new TextEncoder().encode(s);
const mem = (name: string, o: Record<string, string>): MemoryLayer =>
  new MemoryLayer(name, new Map(Object.entries(o).map(([k, v]) => [k, b(v)])));

describe('VirtualFs', () => {
  it('resolve zwraca najwyzsza warstwe z plikiem (normalizacja sciezki)', () => {
    const vfs = new VirtualFs([
      mem('hi', { 'a/b.txt': 'x' }),
      mem('lo', { 'a/b.txt': 'y', 'c.txt': 'z' }),
    ]);
    expect(vfs.resolve('A\\b.txt')?.name).toBe('hi');
    expect(vfs.resolve('C.TXT')?.name).toBe('lo');
    expect(vfs.resolve('nie/ma')).toBeUndefined();
  });

  it('open nieistniejacego rzuca "brak pliku"', async () => {
    const vfs = new VirtualFs([mem('l', {})]);
    await expect(vfs.open('x.txt')).rejects.toThrow('brak pliku');
  });

  it('open czyta z warstwy najwyzszej i leniwie', async () => {
    const fn = vi.fn(async () => b('lazy'));
    const vfs = new VirtualFs([
      new MemoryLayer('m', new Map([['F.txt', fn]])),
      mem('lo', { 'f.txt': 'old' }),
    ]);
    expect(fn).not.toHaveBeenCalled();
    expect(new TextDecoder().decode(await vfs.open('f.TXT'))).toBe('lazy');
  });

  it('list laczy warstwy bez duplikatow, posortowane', () => {
    const vfs = new VirtualFs([
      mem('a', { 'art/b': '1', 'art/a': '1', x: '1' }),
      mem('b', { 'Art\\a': '2', 'art/c': '2' }),
    ]);
    expect(vfs.list('art/')).toEqual(['art/a', 'art/b', 'art/c']);
  });

  it('list("art") bez ukosnika nie dopasowuje "artifact"', () => {
    const vfs = new VirtualFs([mem('a', { 'art/a': '1', 'artifact/z': '1', 'art2.txt': '1' })]);
    expect(vfs.list('art')).toEqual(['art/a']);
    expect(vfs.list('')).toHaveLength(3);
  });
});

describe('Dat2Layer i openGameFolder', () => {
  const dat = (name: string, files: Record<string, string>) =>
    bufferSource(
      buildDat2(Object.entries(files).map(([n, v]) => ({ name: n, data: b(v), compress: true }))),
    );

  it('kolejnosc warstw: patch nadpisuje critter i master', async () => {
    const vfs = await openGameFolder({
      master: dat('m', { 'Data\\CITY.TXT': 'm', 'a.txt': 'm' }),
      critter: dat('c', { 'art\\c.frm': 'c' }),
      patch: dat('p', { 'data\\city.txt': 'p' }),
    });
    expect(vfs.resolve('data/city.txt')?.name).toBe('patch000');
    expect(vfs.resolve('art/c.frm')?.name).toBe('critter');
    expect(vfs.resolve('a.txt')?.name).toBe('master');
    expect(new TextDecoder().decode(await vfs.open('DATA\\City.txt'))).toBe('p');
  });

  it('cache: set przy pierwszym otwarciu, drugie bez czytania drzewa', async () => {
    const store = new Map<string, import('@f2/formats').Dat2Index>();
    const cache: IndexCache = {
      get: async (k) => store.get(k),
      set: async (k, i) => void store.set(k, i),
    };
    const set = vi.spyOn(cache, 'set');
    const m = dat('m', { 'a.txt': 'm' });
    const c = dat('c', { 'b.txt': 'c' });
    const keys = { master: 'M', critter: 'C' };
    await openGameFolder({ master: m, critter: c }, cache, keys);
    expect(set).toHaveBeenCalledTimes(2);
    const mr = vi.spyOn(m, 'read');
    const cr = vi.spyOn(c, 'read');
    const vfs = await openGameFolder({ master: m, critter: c }, cache, keys);
    expect(mr).not.toHaveBeenCalled();
    expect(cr).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledTimes(2);
    expect(new TextDecoder().decode(await vfs.open('a.txt'))).toBe('m');
  });

  it('cache: indeks o innym rozmiarze niz zrodlo jest odrzucany i przeparsowany', async () => {
    const store = new Map<string, import('@f2/formats').Dat2Index>();
    const cache: IndexCache = {
      get: async (k) => store.get(k),
      set: async (k, i) => void store.set(k, i),
    };
    const old = dat('m', { 'old.txt': 'x' });
    const keys = { master: 'M', critter: 'C' };
    const c = dat('c', { 'b.txt': 'c' });
    await openGameFolder({ master: old, critter: c }, cache, keys);
    const fresh = dat('m', { 'new.txt': 'nowy plik dluzszy' });
    const vfs = await openGameFolder({ master: fresh, critter: c }, cache, keys);
    expect(vfs.resolve('new.txt')?.name).toBe('master');
    expect(vfs.resolve('old.txt')).toBeUndefined();
    expect(store.get('M')?.dataSize).toBe(fresh.size);
  });

  it('cache bez keys rzuca czytelny blad', async () => {
    const cache: IndexCache = { get: async () => undefined, set: async () => {} };
    await expect(
      openGameFolder({ master: dat('m', {}), critter: dat('c', {}) }, cache),
    ).rejects.toThrow(/keys/);
  });

  it('Dat2Layer odrzuca wpis z unpackedSize > 256 MiB (FormatError)', async () => {
    const bytes = buildDat2([{ name: 'big.bin', data: b('abc'), compress: true }]);
    // tree: count(4) nameLen(4) name(7) flag(1) unpacked(4) ...
    const treeSize = new DataView(bytes.buffer).getUint32(bytes.length - 8, true);
    const unpackedPos = bytes.length - 8 - treeSize + 4 + 4 + 7 + 1;
    new DataView(bytes.buffer).setUint32(unpackedPos, 256 * 1024 * 1024 + 1, true);
    const layer = await Dat2Layer.open('x', bufferSource(bytes));
    await expect(layer.open('big.bin')).rejects.toThrow(/256 MiB|zbyt duzy/);
    await expect(layer.open('big.bin')).rejects.toMatchObject({ name: 'FormatError' });
  });
});

describe('openGameFolderNode', () => {
  it('brak critter.dat -> "brak pliku: CRITTER.DAT"', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'f2vfs-'));
    await writeFile(join(dir, 'master.dat'), new Uint8Array(0));
    await expect(openGameFolderNode(dir)).rejects.toThrow('brak pliku: CRITTER.DAT');
  });
  it('brak master.dat -> "brak pliku: MASTER.DAT"', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'f2vfs-'));
    await expect(openGameFolderNode(dir)).rejects.toThrow('brak pliku: MASTER.DAT');
  });
  it('male litery i overlay data/', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'f2vfs-'));
    const ov = await mkdtemp(join(tmpdir(), 'f2ov-'));
    const { mkdir } = await import('node:fs/promises');
    await writeFile(
      join(dir, 'master.dat'),
      buildDat2([{ name: 'a.txt', data: b('m'), compress: false }]),
    );
    await writeFile(
      join(dir, 'Critter.DAT'),
      buildDat2([{ name: 'b.txt', data: b('c'), compress: true }]),
    );
    await mkdir(join(ov, 'Data', 'sub'), { recursive: true });
    await writeFile(join(ov, 'Data', 'sub', 'o.txt'), b('ov'));
    const vfs = await openGameFolderNode(dir, ov);
    expect(vfs.resolve('sub/o.txt')?.name).toBe('overlay');
    expect(vfs.resolve('data/sub/o.txt')).toBeUndefined();
    expect(new TextDecoder().decode(await vfs.open('sub\\O.TXT'))).toBe('ov');
    expect(vfs.resolve('b.txt')?.name).toBe('critter');
  });
  it('regresja: overlay DATA/Text/... zaslania text/... z DAT (bez prefiksu data/)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'f2vfs-'));
    const ov = await mkdtemp(join(tmpdir(), 'f2ov-'));
    const { mkdir } = await import('node:fs/promises');
    await writeFile(
      join(dir, 'master.dat'),
      buildDat2([{ name: 'text/english/game/x.msg', data: b('stary'), compress: false }]),
    );
    await writeFile(
      join(dir, 'critter.dat'),
      buildDat2([{ name: 'c.txt', data: b('c'), compress: false }]),
    );
    await mkdir(join(ov, 'DATA', 'Text', 'English', 'Game'), { recursive: true });
    await writeFile(join(ov, 'DATA', 'Text', 'English', 'Game', 'X.MSG'), b('nowy'));
    const vfs = await openGameFolderNode(dir, ov);
    expect(vfs.resolve('text/english/game/x.msg')?.name).toBe('overlay');
    expect(new TextDecoder().decode(await vfs.open('text\\english\\game\\x.msg'))).toBe('nowy');
    expect(vfs.list('data/')).toEqual([]);
  });
  it('close() zamyka uchwyty DAT: kolejny odczyt rzuca "plik zamkniety"', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'f2vfs-'));
    await writeFile(
      join(dir, 'master.dat'),
      buildDat2([{ name: 'a.txt', data: b('m'), compress: false }]),
    );
    await writeFile(
      join(dir, 'critter.dat'),
      buildDat2([{ name: 'b.txt', data: b('c'), compress: false }]),
    );
    const vfs = await openGameFolderNode(dir);
    expect(new TextDecoder().decode(await vfs.open('a.txt'))).toBe('m');
    await vfs.close();
    await vfs.close(); // idempotentne
    await expect(vfs.open('a.txt')).rejects.toThrow('plik zamkniety');
  });
});
