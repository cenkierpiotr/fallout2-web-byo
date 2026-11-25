import { describe, expect, it, vi } from 'vitest';
import { ensurePersistent } from './storage-persistence';

describe('ensurePersistent', () => {
  it('brak API: unsupported', async () => {
    expect(await ensurePersistent(undefined)).toBe('unsupported');
    expect(await ensurePersistent({} as StorageManager)).toBe('unsupported');
  });
  it('juz trwale: nie prosi ponownie', async () => {
    const persist = vi.fn(async () => true);
    expect(await ensurePersistent({ persisted: async () => true, persist } as never)).toBe(
      'granted',
    );
    expect(persist).not.toHaveBeenCalled();
  });
  it('prosi o trwalosc i zwraca granted albo denied', async () => {
    expect(
      await ensurePersistent({ persisted: async () => false, persist: async () => true } as never),
    ).toBe('granted');
    expect(
      await ensurePersistent({ persisted: async () => false, persist: async () => false } as never),
    ).toBe('denied');
  });
  it('wyjatek API: denied, bez rzucania', async () => {
    const s = {
      persisted: async () => false,
      persist: async () => {
        throw new Error('x');
      },
    } as never;
    expect(await ensurePersistent(s)).toBe('denied');
  });
});
