import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Dat2Index } from '@f2/formats';
import { idbIndexCache, loadFolderHandle, saveFolderHandle } from './index-cache-idb.js';

/** Minimalny stub IndexedDB: jeden store w pamieci, zdarzenia asynchroniczne. */
let opened = 0;
let closed = 0;
function installFakeIdb(): void {
  opened = 0;
  closed = 0;
  const data = new Map<string, unknown>();
  const later = (fn: () => void): void => void setTimeout(fn, 0);
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => undefined,
    close: () => void closed++,
    transaction: () => {
      const tx: Record<string, unknown> = {};
      tx.objectStore = () => ({
        get: (k: string) => {
          const req: Record<string, unknown> = {};
          later(() => {
            req.result = data.get(k);
            (req.onsuccess as () => void)();
          });
          return req;
        },
        put: (v: unknown, k: string) => {
          data.set(k, v);
          later(() => (tx.oncomplete as () => void)());
        },
      });
      return tx;
    },
  };
  (globalThis as Record<string, unknown>).indexedDB = {
    open: () => {
      opened++;
      const req: Record<string, unknown> = { result: db };
      later(() => {
        (req.onupgradeneeded as () => void)();
        (req.onsuccess as () => void)();
      });
      return req;
    },
  };
}

describe('idbIndexCache', () => {
  beforeEach(installFakeIdb);
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).indexedDB;
  });
  it('set/get roundtrip', async () => {
    const c = idbIndexCache();
    expect(await c.get('k')).toBeUndefined();
    const idx: Dat2Index = { treeSize: 1, dataSize: 2, entries: [], byName: new Map() };
    await c.set('k', idx);
    expect(await c.get('k')).toBe(idx);
  });
  it('zamyka polaczenie po kazdej operacji', async () => {
    const c = idbIndexCache();
    await c.get('a');
    await c.set('a', { treeSize: 1, dataSize: 2, entries: [], byName: new Map() });
    expect(opened).toBe(2);
    expect(closed).toBe(2);
  });
  it('loadFolderHandle: uprawnienie przyznane -> uchwyt, odmowa -> null', async () => {
    const mk = (state: string, canRequest = false) => ({
      queryPermission: async () => state,
      requestPermission: async () => (canRequest ? 'granted' : 'denied'),
    });
    const h1 = mk('granted') as unknown as FileSystemDirectoryHandle;
    await saveFolderHandle(h1);
    expect(await loadFolderHandle()).toBe(h1);
    const h2 = mk('prompt', true) as unknown as FileSystemDirectoryHandle;
    await saveFolderHandle(h2);
    expect(await loadFolderHandle()).toBeNull();
    expect(await loadFolderHandle({ request: true })).toBe(h2);
    const h3 = mk('denied') as unknown as FileSystemDirectoryHandle;
    await saveFolderHandle(h3);
    expect(await loadFolderHandle({ request: true })).toBeNull();
  });
});
