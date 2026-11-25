import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemorySaveBackend, SaveStore } from '@f2/engine-core';
import {
  chooseBackupDir,
  loadLastBackup,
  pruneBackups,
  runAutoBackup,
  saveLastBackup,
  shouldAutoBackup,
  supportsDirectoryBackup,
  type FsDirHandle,
  type HandleStore,
} from './auto-backup';

function fakeDir(
  initial: string[] = [],
  perm: PermissionState = 'granted',
): FsDirHandle & { files: Map<string, Blob>; asked: number } {
  const files = new Map<string, Blob>(initial.map((n) => [n, new Blob(['x'])]));
  const d = {
    kind: 'directory' as const,
    name: 'kopie',
    files,
    asked: 0,
    getFileHandle: async (name: string) => ({
      kind: 'file' as const,
      name,
      createWritable: async () => ({
        write: async (b: Blob) => void files.set(name, b),
        close: async () => undefined,
      }),
    }),
    removeEntry: async (n: string) => void files.delete(n),
    values: async function* () {
      for (const name of [...files.keys()]) yield { kind: 'file', name };
    },
    queryPermission: async () => perm,
    requestPermission: async () => {
      d.asked++;
      return 'granted' as PermissionState;
    },
  };
  return d;
}
const mem = (h: FsDirHandle | null = null): HandleStore => {
  let cur = h;
  return { get: async () => cur, set: async (n) => void (cur = n) };
};
const store = (): SaveStore => new SaveStore(new MemorySaveBackend());

describe('auto-backup do folderu', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('wykrywa wsparcie File System Access API', () => {
    expect(supportsDirectoryBackup({})).toBe(false);
    expect(supportsDirectoryBackup({ showDirectoryPicker: () => undefined })).toBe(true);
  });
  it('wybor folderu zapamietuje uchwyt; anulowanie i brak API daja null', async () => {
    const dir = fakeDir();
    const hs = mem();
    expect(await chooseBackupDir({ showDirectoryPicker: async () => dir }, hs)).toBe(dir);
    expect(await hs.get()).toBe(dir);
    const hs2 = mem();
    expect(
      await chooseBackupDir(
        { showDirectoryPicker: async () => Promise.reject(new Error('abort')) },
        hs2,
      ),
    ).toBeNull();
    expect(await chooseBackupDir({}, hs2)).toBeNull();
    expect(await hs2.get()).toBeNull();
  });
  it('zapisuje plik .f2save i przycina do 7 najnowszych, obcych plikow nie rusza', async () => {
    const old = Array.from({ length: 8 }, (_, i) => `fallout2-web-2026-10-0${i + 1}.f2save`);
    const dir = fakeDir([...old, 'notatki.txt']);
    const r = await runAutoBackup(store(), mem(dir), { now: new Date('2026-11-10T12:00:00Z') });
    expect(r.ok).toBe(true);
    expect(dir.files.has('fallout2-web-2026-11-10.f2save')).toBe(true);
    expect((dir.files.get('fallout2-web-2026-11-10.f2save') as Blob).size).toBeGreaterThan(0);
    expect(dir.files.has('notatki.txt')).toBe(true);
    const backups = [...dir.files.keys()].filter((n) => n.endsWith('.f2save'));
    expect(backups).toHaveLength(7);
    expect(backups).not.toContain('fallout2-web-2026-10-01.f2save');
    expect(backups).not.toContain('fallout2-web-2026-10-02.f2save');
  });
  it('brak folderu, brak zgody (tryb tlowy nie pyta) i monit w trybie interaktywnym', async () => {
    expect(await runAutoBackup(store(), mem(null))).toEqual({ ok: false, reason: 'no-folder' });
    const d = fakeDir([], 'prompt');
    expect(await runAutoBackup(store(), mem(d))).toEqual({ ok: false, reason: 'permission' });
    expect(d.asked).toBe(0);
    const r = await runAutoBackup(store(), mem(d), { interactive: true });
    expect(r.ok).toBe(true);
    expect(d.asked).toBe(1);
  });
  it('blad zapisu daje failed zamiast wyjatku', async () => {
    const d = fakeDir();
    d.getFileHandle = async () => Promise.reject(new Error('dysk pelny'));
    expect(await runAutoBackup(store(), mem(d))).toEqual({ ok: false, reason: 'failed' });
  });
  it('pruneBackups: nic nie robi gdy plikow <= keep', async () => {
    const d = fakeDir(['fallout2-web-2026-10-01.f2save']);
    expect(await pruneBackups(d, 7)).toEqual([]);
  });
  it('odstep miedzy kopiami i zapamietanie ostatniej', () => {
    const mapStore = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mapStore.get(k) ?? null,
      setItem: (k: string, v: string) => void mapStore.set(k, v),
    });
    expect(loadLastBackup()).toBeNull();
    expect(shouldAutoBackup(null, 1000)).toBe(true);
    expect(shouldAutoBackup(1000, 1000 + 3600_000)).toBe(false);
    expect(shouldAutoBackup(1000, 1000 + 7 * 3600_000)).toBe(true);
    saveLastBackup(12345);
    expect(loadLastBackup()).toBe(12345);
  });
});
