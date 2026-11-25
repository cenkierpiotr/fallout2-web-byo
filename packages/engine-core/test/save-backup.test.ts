import { describe, expect, it } from 'vitest';
import { exportAllSaves, importBackup, BACKUP_MAGIC } from '../src/save/backup.js';
import { serializeWorld } from '../src/save/serialize.js';
import { MemorySaveBackend, SaveStore } from '../src/save/save-store.js';
import { arbitraryWorld } from './save-fixtures.js';

const metaFor = (slot: string, realTime: number) => ({
  slot,
  name: slot,
  characterName: 'C',
  level: 1,
  location: 'L',
  gameDate: 'd',
  realTime,
  engineVersion: '0',
  thumbnail: null,
});

async function storeWith(slots: [string, number][]): Promise<SaveStore> {
  const st = new SaveStore(new MemorySaveBackend());
  for (const [slot, t] of slots) {
    await st.write(slot, serializeWorld(arbitraryWorld(t), metaFor(slot, t)));
  }
  return st;
}

describe('backup zapisow', () => {
  it('eksport i import wszystkich slotow daje rowne zapisy', async () => {
    const a = await storeWith([
      ['quick', 1],
      ['manual-0', 2],
      ['auto-1', 3],
    ]);
    const blob = await exportAllSaves(a, { app: 'test', now: 100 });
    const b = new SaveStore(new MemorySaveBackend());
    const r = await importBackup(blob, b, 'replace');
    expect(r).toEqual({ imported: 3, skipped: 0, errors: [] });
    for (const slot of ['quick', 'manual-0', 'auto-1'])
      expect(await b.read(slot)).toEqual(await a.read(slot));
  });

  it('merge zostawia nowszy slot, replace nadpisuje', async () => {
    const src = await storeWith([['manual-0', 10]]);
    const blob = await exportAllSaves(src, { app: 't', now: 1 });
    const newer = await storeWith([['manual-0', 50]]);
    const m = await importBackup(blob, newer, 'merge');
    expect(m).toEqual({ imported: 0, skipped: 1, errors: [] });
    expect((await newer.read('manual-0'))?.meta.realTime).toBe(50);
    const r = await importBackup(blob, newer, 'replace');
    expect(r.imported).toBe(1);
    expect((await newer.read('manual-0'))?.meta.realTime).toBe(10);
  });

  it('replace usuwa sloty spoza kopii, merge je zachowuje', async () => {
    const src = await storeWith([['quick', 5]]);
    const blob = await exportAllSaves(src, { app: 't', now: 1 });
    const dst = await storeWith([['manual-2', 7]]);
    await importBackup(blob, dst, 'merge');
    expect(await dst.read('manual-2')).not.toBeNull();
    await importBackup(blob, dst, 'replace');
    expect(await dst.read('manual-2')).toBeNull();
    expect(await dst.read('quick')).not.toBeNull();
  });

  it('zly plik daje czytelny blad, nic nie zmienia', async () => {
    const dst = await storeWith([['quick', 5]]);
    const r = await importBackup(new Blob(['smieci']), dst, 'replace');
    expect(r.imported).toBe(0);
    expect(r.errors).toEqual(['backup-corrupt']);
    expect(await dst.read('quick')).not.toBeNull();
  });

  it('inny magic: backup-corrupt', async () => {
    const gz = await new Response(
      new Blob([JSON.stringify({ magic: 'x', slots: [] })])
        .stream()
        .pipeThrough(new CompressionStream('gzip')),
    ).blob();
    expect((await importBackup(gz, await storeWith([]), 'merge')).errors).toEqual([
      'backup-corrupt',
    ]);
    expect(BACKUP_MAGIC).toBe('f2save-backup');
  });

  it('uszkodzony lub nowszy slot jest pominiety z bledem, reszta importowana', async () => {
    const src = await storeWith([['quick', 5]]);
    const good = JSON.parse(
      await (async () => {
        const b = await exportAllSaves(src, { app: 't', now: 1 });
        return new Response(b.stream().pipeThrough(new DecompressionStream('gzip'))).text();
      })(),
    );
    good.slots.push({ slot: 'manual-1', version: 99 }, { slot: 'bogus-9', x: 1 });
    const blob = await new Response(
      new Blob([JSON.stringify(good)]).stream().pipeThrough(new CompressionStream('gzip')),
    ).blob();
    const dst = await storeWith([]);
    const r = await importBackup(blob, dst, 'merge');
    expect(r.imported).toBe(1);
    expect(r.errors.length).toBe(2);
    expect(await dst.read('quick')).not.toBeNull();
  });
});

describe('limit rozpakowania importu (gzip-bomb)', () => {
  it('importBackup/importSave odrzucaja plik rozpakowujacy sie ponad limit', async () => {
    const { gunzipText } = await import('../src/save/gunzip-limited.js');
    const big = await new Response(
      new Blob(['x'.repeat(2_000_000)]).stream().pipeThrough(new CompressionStream('gzip')),
    ).blob();
    expect(big.size).toBeLessThan(50_000);
    await expect(gunzipText(big, 1_000_000)).rejects.toThrow(/zbyt duzy/);
    expect((await gunzipText(big, 3_000_000)).length).toBe(2_000_000);
    const st = new SaveStore(new MemorySaveBackend());
    const r = await importBackup(big, st, 'merge');
    expect(r.errors).toEqual(['backup-corrupt']);
  });
});
