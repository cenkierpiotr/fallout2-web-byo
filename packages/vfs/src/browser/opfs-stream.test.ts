import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeOpfs, type FakeFile } from './fake-opfs.js';
import { copyToOpfs, openOpfsFolder } from './opfs-copy.js';
import { writeOpfsFile } from './opfs-write.js';
import type { PickedFolder } from './pick-folder.js';
import { zipToOpfs } from './zip-opfs.js';

/** Deterministyczne dane pseudolosowe (nie kompresuja sie). */
function noise(n: number, seed = 1): Uint8Array {
  const u = new Uint8Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    u[i] = s >>> 24;
  }
  return u;
}
const same = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i]);

afterEach(() => {
  delete (globalThis as Record<string, unknown>).navigator;
  vi.restoreAllMocks();
});

describe('writeOpfsFile: strumieniowo', () => {
  it('sync (Safari): kawalki <= chunkSize, bez arrayBuffer() calego Blob-a', async () => {
    const { root, stats } = installFakeOpfs('sync');
    const data = noise(100_000);
    const blob = new Blob([data as BlobPart]);
    const spy = vi.spyOn(blob, 'arrayBuffer');
    const fh = await root.getFileHandle('master.dat', { create: true });
    await writeOpfsFile(fh as never, blob, { chunkSize: 1024 });
    expect(same(fh.data, data)).toBe(true);
    expect(stats.maxChunk).toBeLessThanOrEqual(1024);
    expect(stats.writes.get('master.dat')).toBe(Math.ceil(100_000 / 1024));
    expect(spy).not.toHaveBeenCalled();
    expect(stats.workersTerminated).toBe(1);
  });

  it('sync: pusty plik i tekst', async () => {
    const { root } = installFakeOpfs('sync');
    const a = await root.getFileHandle('a', { create: true });
    await writeOpfsFile(a as never, new Blob([]));
    expect(a.data.length).toBe(0);
    const b = await root.getFileHandle('b', { create: true });
    await writeOpfsFile(b as never, 'abc');
    expect(new TextDecoder().decode(b.data)).toBe('abc');
  });

  it('writable (Chrome/FSA): strumien, nie jeden wielki zapis', async () => {
    const { root, stats } = installFakeOpfs('writable');
    const data = noise(3_000_000);
    const fh = await root.getFileHandle('master.dat', { create: true });
    await writeOpfsFile(fh as never, new Blob([data as BlobPart]), { chunkSize: 256 * 1024 });
    expect(same(fh.data, data)).toBe(true);
    expect(stats.maxChunk).toBeLessThan(data.length / 4);
  });

  it('przerwanie w trakcie: AbortError, worker zatrzymany, brak znacznika', async () => {
    const { root, stats } = installFakeOpfs('sync');
    const ac = new AbortController();
    const fh = await root.getFileHandle('m', { create: true });
    const p = writeOpfsFile(fh as never, new Blob([noise(50_000)]), {
      chunkSize: 1000,
      signal: ac.signal,
      onBytes: (w) => {
        if (w >= 10_000) ac.abort();
      },
    });
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(stats.workersTerminated).toBe(1);
    expect(fh.data.length).toBeLessThan(50_000);
  });
});

interface FakeFileHost {
  getFileHandle(n: string, o: { create: boolean }): Promise<{ data: Uint8Array }>;
}

const picked = (files: Record<string, Uint8Array>): PickedFolder => ({
  kind: 'files',
  files: new Map(
    Object.entries(files).map(([k, v]) => [k, new File([v as BlobPart], k, { lastModified: 1 })]),
  ),
});

describe('copyToOpfs: wznowienie i przerwanie', () => {
  const src = (): Record<string, Uint8Array> => ({
    'master.dat': noise(20_000, 1),
    'critter.dat': noise(5000, 2),
    'data/a.msg': noise(300, 3),
  });

  it('przerwana kopia: kolejna wznawia, pomija gotowe pliki', async () => {
    const { root, stats } = installFakeOpfs('sync');
    const ac = new AbortController();
    await expect(
      copyToOpfs(
        picked(src()),
        (done) => {
          if (done === 1) ac.abort();
        },
        { signal: ac.signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(await openOpfsFolder()).toBeNull(); // brak .complete
    const wrote = new Map(stats.writes);
    const r = await copyToOpfs(picked(src()), () => undefined);
    expect(r.files.size).toBe(3);
    // pierwszy zapisany plik nie byl ponownie zapisywany
    const first = [...wrote.keys()].find((k) => k.endsWith('.dat') || k.endsWith('.msg'))!;
    expect(stats.writes.get(first)).toBe(wrote.get(first));
    const base = await root.getDirectoryHandle('fallout2-game');
    expect(base.children.has('.complete')).toBe(true);
    expect(base.children.has('.session')).toBe(false);
    const m = (await base.getFileHandle('master.dat')) as FakeFile;
    expect(same(m.data, src()['master.dat']!)).toBe(true);
    expect((await openOpfsFolder())?.files.size).toBe(3);
  });

  it('inne zrodlo = kopia od zera (bez wznowienia)', async () => {
    const { stats } = installFakeOpfs('writable');
    const ac = new AbortController();
    await expect(
      copyToOpfs(picked(src()), (d) => d === 1 && ac.abort(), { signal: ac.signal }),
    ).rejects.toBeTruthy();
    const other = { ...src(), 'master.dat': noise(21_000, 9) };
    stats.writes.clear();
    await copyToOpfs(picked(other), () => undefined);
    expect(stats.writes.get('master.dat')).toBeGreaterThan(0);
    expect(stats.writes.get('critter.dat')).toBeGreaterThan(0);
  });

  it('duzy plik w trybie sync: szczytowy bufor ograniczony do kawalka', async () => {
    const { stats } = installFakeOpfs('sync');
    const big = noise(9 * 1024 * 1024);
    await copyToOpfs(picked({ 'master.dat': big, 'critter.dat': noise(10) }), () => undefined);
    expect(stats.maxChunk).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect((await openOpfsFolder())?.files.get('master.dat')?.size).toBe(big.length);
  });
});

describe('zipToOpfs', () => {
  it('strumieniowo do OPFS, katalog gry z prefiksu, junk usuniety', async () => {
    const { root, stats } = installFakeOpfs('sync');
    const master = noise(3_000_000, 7);
    const z = zipSync({
      'Fallout 2/MASTER.DAT': [master, { level: 6 }],
      'Fallout 2/critter.dat': [noise(2000, 2), { level: 0 }],
      'Fallout 2/DATA/Text/a.msg': strToU8('msg'),
      'Fallout 2/FALLOUT2.exe': strToU8('exe'),
      'Inne/data/x.msg': strToU8('x'),
    });
    let peakQueue = 0;
    let last: [number, number] = [0, 0];
    const r = await zipToOpfs(new Blob([z as BlobPart]), (a, b) => (last = [a, b]), {
      inChunk: 64 * 1024,
      onQueuePeak: (q) => (peakQueue = Math.max(peakQueue, q)),
    });
    expect(r.kind).toBe('opfs');
    expect([...r.files.keys()].sort()).toEqual(['critter.dat', 'data/text/a.msg', 'master.dat']);
    expect(same(new Uint8Array(await r.files.get('master.dat')!.arrayBuffer()), master)).toBe(true);
    expect(last[0]).toBe(last[1]);
    // szczyt: pojedynczy zapis i kolejka to male ulamki pliku (nie 3 MB naraz)
    expect(stats.maxChunk).toBeLessThan(master.length / 8);
    expect(peakQueue).toBeLessThan(master.length / 4);
    const base = await root.getDirectoryHandle('fallout2-game');
    expect([...base.children.keys()].sort()).toEqual(['.complete', 'Fallout 2']);
    const again = await openOpfsFolder();
    expect(again?.files.size).toBe(3);
  });

  it('korzen bez prefiksu', async () => {
    installFakeOpfs('writable');
    const r = await zipToOpfs(
      new Blob([zipSync({ 'MASTER.DAT': strToU8('x'), 'patch000.dat': strToU8('p') }) as BlobPart]),
    );
    expect([...r.files.keys()].sort()).toEqual(['master.dat', 'patch000.dat']);
  });

  it('bez master.dat: pusty folder, OPFS posprzatany', async () => {
    const { root } = installFakeOpfs('writable');
    const r = await zipToOpfs(new Blob([zipSync({ 'a/readme.txt': strToU8('x') }) as BlobPart]));
    expect(r.files.size).toBe(0);
    expect(root.children.size).toBe(0);
  });

  it('odrzuca zip-slip i sprzata', async () => {
    const { root } = installFakeOpfs('writable');
    await expect(
      zipToOpfs(new Blob([zipSync({ '../evil/master.dat': strToU8('x') }) as BlobPart])),
    ).rejects.toThrow('niebezpieczna');
    expect(root.children.size).toBe(0);
  });

  it('limit rozpakowania (zip-bomb) i sprzatanie', async () => {
    const { root } = installFakeOpfs('sync');
    const z = zipSync({ 'MASTER.DAT': [strToU8('A'.repeat(100_000)), { level: 9 }] });
    await expect(
      zipToOpfs(new Blob([z as BlobPart]), undefined, { maxBytes: 50_000 }),
    ).rejects.toThrow(/zbyt duze/);
    expect(root.children.size).toBe(0);
    const ok = await zipToOpfs(new Blob([z as BlobPart]), undefined, { maxBytes: 200_000 });
    expect(ok.files.get('master.dat')?.size).toBe(100_000);
  });

  it('uszkodzone archiwum i przerwanie', async () => {
    const { root } = installFakeOpfs('writable');
    await expect(zipToOpfs(new Blob([new Uint8Array([1, 2, 3, 4, 5])]))).rejects.toThrow('zip:');
    const ac = new AbortController();
    ac.abort();
    await expect(
      zipToOpfs(new Blob([zipSync({ 'MASTER.DAT': strToU8('x') }) as BlobPart]), undefined, {
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(root.children.size).toBe(0);
  });

  describe('wznowienie i anulowanie importu ZIP', () => {
    const mk = () =>
      Object.assign(
        new Blob([
          zipSync({
            'Game/master.dat': [noise(40_000, 1), { level: 0 }],
            'Game/critter.dat': [noise(40_000, 2), { level: 0 }],
            'Game/data/a.txt': strToU8('hello'),
          }) as BlobPart,
        ]),
        { name: 'g.zip', lastModified: 5 },
      );

    it('anulowanie w trakcie: gotowe pliki zostaja, niedokonczony usuniety, wznowienie pomija gotowe', async () => {
      const { root, stats } = installFakeOpfs('writable');
      const ac = new AbortController();
      const zip = mk();
      let peaks = 0;
      await expect(
        zipToOpfs(zip, undefined, {
          signal: ac.signal,
          inChunk: 1000,
          onQueuePeak: () => {
            // przerwij, gdy pierwszy plik jest juz gotowy (widac go w dzienniku)
            const base = root.children.get('fallout2-game') as { children: Map<string, unknown> };
            const j = base?.children.get('.zipsession') as { data: Uint8Array } | undefined;
            if (j && ++peaks > 0 && new TextDecoder().decode(j.data).includes('master.dat'))
              ac.abort();
          },
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      const base = root.children.get('fallout2-game') as {
        children: Map<string, { data?: Uint8Array }>;
      };
      expect(base).toBeDefined();
      expect(base.children.get('Game')).toBeDefined();
      const gameDir = base.children.get('Game') as unknown as { children: Map<string, unknown> };
      expect(gameDir.children.has('master.dat')).toBe(true);
      expect(gameDir.children.has('critter.dat')).toBe(false);
      stats.writes.clear();
      const r = await zipToOpfs(zip);
      expect(r.files.get('master.dat')?.size).toBe(40_000);
      expect(r.files.get('critter.dat')?.size).toBe(40_000);
      expect(stats.writes.get('master.dat')).toBeUndefined(); // pominiety
      expect(stats.writes.get('critter.dat')).toBeGreaterThan(0);
      expect(base.children.has('.zipsession')).toBe(false);
    });

    it('inne archiwum = import od zera', async () => {
      const { root, stats } = installFakeOpfs('writable');
      const ac = new AbortController();
      const zip = mk();
      await expect(
        zipToOpfs(zip, undefined, {
          signal: ac.signal,
          inChunk: 1000,
          onQueuePeak: () => ac.abort(),
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
      expect(root.children.size).toBe(0); // nic gotowego: pelne sprzatanie
      void stats;
      const other = Object.assign(new Blob([await zip.arrayBuffer()]), { name: 'x.zip' });
      const r = await zipToOpfs(other);
      expect(r.files.size).toBeGreaterThan(0);
    });

    it('odswiezenie (porzucony import bez sprzatania): wznawia od niepelnego pliku', async () => {
      const { root, stats } = installFakeOpfs('sync');
      const zip = mk();
      // symulacja: pierwszy plik gotowy + dziennik, drugi zapisany czesciowo bez wpisu w dzienniku
      const full = await zipToOpfs(zip);
      expect(full.files.size).toBe(3);
      const base = root.children.get('fallout2-game') as unknown as {
        children: Map<string, { data: Uint8Array }>;
      };
      base.children.delete('.complete');
      const game = base.children.get('Game') as unknown as {
        children: Map<string, { data: Uint8Array }>;
      };
      (game.children.get('critter.dat') as { data: Uint8Array }).data = new Uint8Array(100);
      const fh = await (base as never as FakeFileHost).getFileHandle('.zipsession', {
        create: true,
      });
      fh.data = strToU8(
        JSON.stringify({ sig: `${zip.size}:g.zip:5`, done: { 'Game/master.dat': 40_000 } }),
      );
      stats.writes.clear();
      const r = await zipToOpfs(zip);
      expect(r.files.get('critter.dat')?.size).toBe(40_000);
      expect(stats.writes.get('master.dat')).toBeUndefined();
    });
  });
});
