// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { BackupPanel, autoBackupMessageKey } from './BackupPanel';
import type { runAutoBackup, FsDirHandle, HandleStore } from '../state/auto-backup';

const dir = { kind: 'directory', name: 'moje-kopie' } as unknown as FsDirHandle;
const memHandles = (h: FsDirHandle | null = null): HandleStore => {
  let cur = h;
  return { get: async () => cur, set: async (n) => void (cur = n) };
};

describe('BackupPanel: auto-backup', () => {
  it('bez File System Access API nie pokazuje sekcji (fallback: reczny eksport zostaje)', () => {
    render(<BackupPanel supported={false} />);
    expect(screen.getByTestId('backup-export')).toBeTruthy();
    expect(screen.queryByTestId('auto-backup')).toBeNull();
    cleanup();
  });
  it('wybor folderu uruchamia kopie i pokazuje komunikat; wylaczenie czysci folder', async () => {
    localStorage.clear();
    const handles = memHandles();
    const run = vi.fn(async () => ({
      ok: true as const,
      file: 'fallout2-web-2026-11-10.f2save',
      pruned: [],
    }));
    render(
      <BackupPanel
        supported
        handles={handles}
        run={run}
        pick={async (_w, h) => (await h.set(dir), dir)}
      />,
    );
    fireEvent.click(screen.getByTestId('auto-backup-choose'));
    await waitFor(() =>
      expect(screen.getByTestId('auto-backup-msg').textContent).toContain(
        'fallout2-web-2026-11-10.f2save',
      ),
    );
    expect(run).toHaveBeenCalledWith(expect.anything(), handles, { interactive: true });
    fireEvent.click(screen.getByTestId('auto-backup-off'));
    await waitFor(() => expect(screen.queryByTestId('auto-backup-now')).toBeNull());
    expect(await handles.get()).toBeNull();
    cleanup();
  });
  it('przy starcie z zapamietanym folderem robi cicha kopie raz na odstep', async () => {
    localStorage.clear();
    const run = vi.fn<typeof runAutoBackup>(async () => ({
      ok: true as const,
      file: 'f.f2save',
      pruned: [],
    }));
    render(<BackupPanel supported handles={memHandles(dir)} run={run} />);
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run.mock.calls[0]?.[2]).toBeUndefined();
    cleanup();
    render(<BackupPanel supported handles={memHandles(dir)} run={run} />);
    await waitFor(() => expect(screen.getByTestId('auto-backup-now')).toBeTruthy());
    expect(run).toHaveBeenCalledTimes(1);
    cleanup();
  });
  it('klucze komunikatow bledow', () => {
    expect(autoBackupMessageKey({ ok: false, reason: 'permission' })).toBe('backup.auto.denied');
    expect(autoBackupMessageKey({ ok: false, reason: 'failed' })).toBe('backup.auto.failed');
    expect(autoBackupMessageKey({ ok: true, file: 'x', pruned: [] })).toBe('backup.auto.done');
  });
});
