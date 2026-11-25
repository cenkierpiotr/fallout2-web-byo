import { describe, expect, it, vi } from 'vitest';
import { MemorySaveBackend, SaveStore } from '@f2/engine-core';
import { backupToDownload, restoreFromFile, backupMessageKey } from './backup';

describe('backup w aplikacji', () => {
  it('eksport przekazuje nazwe .f2save i niepusty blob', async () => {
    const download = vi.fn();
    await backupToDownload(
      new SaveStore(new MemorySaveBackend()),
      download,
      new Date('2026-11-10T12:00:00Z'),
    );
    expect(download).toHaveBeenCalledTimes(1);
    const [blob, name] = download.mock.calls[0] as [Blob, string];
    expect(name).toBe('fallout2-web-2026-11-10.f2save');
    expect(blob.size).toBeGreaterThan(0);
  });
  it('import zlego pliku daje klucz bledu', async () => {
    const r = await restoreFromFile(
      new SaveStore(new MemorySaveBackend()),
      new Blob(['x']),
      'merge',
    );
    expect(backupMessageKey(r)).toBe('backup.corrupt');
  });
  it('klucze komunikatow', () => {
    expect(backupMessageKey({ imported: 2, skipped: 0, errors: [] })).toBe('backup.done');
    expect(backupMessageKey({ imported: 1, skipped: 0, errors: ['quick:save-corrupt'] })).toBe(
      'backup.partial',
    );
    expect(backupMessageKey({ imported: 0, skipped: 3, errors: [] })).toBe('backup.nothingNew');
  });
});
