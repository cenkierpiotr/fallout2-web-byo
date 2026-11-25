import { describe, expect, it, vi } from 'vitest';
import { UpdateBlockedError, UpdateManager } from '../src/update-manager.js';
import { type AppVersion, compareSemver, isSemver, parseAppVersion } from '../src/version.js';

const cur: AppVersion = {
  semver: '1.0.0',
  sha: 'aaa',
  schemaVersion: 4,
  builtAt: '2026-11-11T00:00:00Z',
};

function mk(remote: unknown, saving = false) {
  const activate = vi.fn(async () => undefined);
  const reload = vi.fn();
  const m = new UpdateManager({
    current: cur,
    fetchVersion: async () => remote,
    saveInProgress: () => saving,
    activate,
    reload,
  });
  return { m, activate, reload };
}

describe('version', () => {
  it('semver i porownanie', () => {
    expect(isSemver('1.0.0')).toBe(true);
    expect(isSemver('1.0')).toBe(false);
    expect(compareSemver('1.2.0', '1.10.0')).toBe(-1);
    expect(compareSemver('2.0.0', '1.99.99')).toBe(1);
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(() => compareSemver('x', '1.0.0')).toThrow();
  });
  it('parseAppVersion odrzuca smieci', () => {
    expect(parseAppVersion(null)).toBeNull();
    expect(parseAppVersion({ semver: '1.0.0' })).toBeNull();
    expect(parseAppVersion({ ...cur, schemaVersion: 1.5 })).toBeNull();
    expect(parseAppVersion(cur)).toEqual(cur);
  });
});

describe('UpdateManager', () => {
  it('check wykrywa nowszy semver', async () => {
    const { m } = mk({ ...cur, semver: '1.1.0' });
    expect(await m.check()).toBe('available');
    expect(m.pending?.semver).toBe('1.1.0');
  });
  it('check: ten sam semver i inny sha to tez aktualizacja', async () => {
    const { m } = mk({ ...cur, sha: 'bbb' });
    expect(await m.check()).toBe('available');
  });
  it('check: ta sama wersja, starsza wersja, smieci i blad sieci to none', async () => {
    expect(await mk(cur).m.check()).toBe('none');
    expect(await mk({ ...cur, semver: '0.9.0' }).m.check()).toBe('none');
    expect(await mk('smiec').m.check()).toBe('none');
    const m = new UpdateManager({
      current: cur,
      fetchVersion: async () => {
        throw new Error('offline');
      },
      saveInProgress: () => false,
      activate: async () => undefined,
      reload: () => undefined,
    });
    expect(await m.check()).toBe('none');
  });
  it('apply czeka na koniec zapisu (blokada)', async () => {
    const { m, activate, reload } = mk({ ...cur, semver: '1.1.0' }, true);
    await m.check();
    await expect(m.apply()).rejects.toBeInstanceOf(UpdateBlockedError);
    expect(activate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
  it('apply aktywuje i przeladowuje, bez pending nic nie robi', async () => {
    const a = mk({ ...cur, semver: '1.1.0' });
    await a.m.check();
    await a.m.apply();
    expect(a.activate).toHaveBeenCalledOnce();
    expect(a.reload).toHaveBeenCalledOnce();
    const b = mk(cur);
    await b.m.check();
    await b.m.apply();
    expect(b.activate).not.toHaveBeenCalled();
  });
  it('komunikat o migracji tylko przy wyzszym schemacie', async () => {
    const a = mk({ ...cur, semver: '1.1.0', schemaVersion: 5 });
    await a.m.check();
    expect(a.m.needsMigrationNotice).toBe(true);
    const b = mk({ ...cur, semver: '1.1.0' });
    await b.m.check();
    expect(b.m.needsMigrationNotice).toBe(false);
  });
});
