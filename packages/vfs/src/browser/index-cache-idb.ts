import type { Dat2Index } from '@f2/formats';
import type { IndexCache } from '../game-folder.js';

const DB_NAME = 'fallout2-web';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      // inna karta chce podniesc wersje schematu: zwolnij polaczenie
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onblocked = () => reject(new Error('IndexedDB zablokowane'));
    req.onerror = () => reject(req.error);
  });
}

async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function idbIndexCache(): IndexCache {
  return {
    get: (key) => kvGet<Dat2Index>(`index:${key}`),
    set: (key, index) => kvSet(`index:${key}`, index),
  };
}

export async function saveFolderHandle(h: FileSystemDirectoryHandle): Promise<void> {
  await kvSet('folder-handle', h);
}

type PermissionHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
};

/**
 * Zwraca zapamietany uchwyt tylko gdy ma uprawnienie odczytu. Gdy API istnieje
 * i uprawnienie nie jest przyznane, prosi o nie (`request: true` wymaga gestu
 * uzytkownika); bez przyznania zwraca null.
 */
export async function loadFolderHandle(
  options: { request?: boolean } = {},
): Promise<FileSystemDirectoryHandle | null> {
  const h = await kvGet<PermissionHandle>('folder-handle');
  if (!h) return null;
  if (typeof h.queryPermission !== 'function') return h;
  const opts = { mode: 'read' } as const;
  if ((await h.queryPermission(opts)) === 'granted') return h;
  if (options.request && typeof h.requestPermission === 'function') {
    if ((await h.requestPermission(opts)) === 'granted') return h;
  }
  return null;
}
