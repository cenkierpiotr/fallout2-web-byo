import { backupFileName, exportAllSaves, type SaveStore } from '@f2/engine-core';

/** Minimalne, strukturalne typy File System Access API (brak ich w lib.dom). */
export interface FsWritable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}
export interface FsFileHandle {
  kind: 'file';
  name: string;
  createWritable(): Promise<FsWritable>;
}
export interface FsDirHandle {
  kind: 'directory';
  name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>;
  removeEntry(name: string): Promise<void>;
  values(): AsyncIterable<{ kind: string; name: string }>;
  queryPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'readwrite' }): Promise<PermissionState>;
}

/** Zapamietanie wybranego folderu (IndexedDB; uchwyty da sie klonowac strukturalnie). */
export interface HandleStore {
  get(): Promise<FsDirHandle | null>;
  set(h: FsDirHandle | null): Promise<void>;
}

export const BACKUP_KEEP = 7;
const BACKUP_RE = /^fallout2-web-\d{4}-\d{2}-\d{2}\.f2save$/;
const LAST_KEY = 'f2.autobackup.last';
export const AUTO_BACKUP_MIN_INTERVAL_MS = 6 * 3600_000;

/** Czy przegladarka wspiera wybor folderu do zapisu (Chromium; Safari i Firefox: fallback = reczny eksport). */
export function supportsDirectoryBackup(
  w: { showDirectoryPicker?: unknown } = globalThis as never,
): boolean {
  return typeof w.showDirectoryPicker === 'function';
}

export async function chooseBackupDir(
  w: { showDirectoryPicker?: (o: { mode: 'readwrite' }) => Promise<FsDirHandle> },
  handles: HandleStore,
): Promise<FsDirHandle | null> {
  if (typeof w.showDirectoryPicker !== 'function') return null;
  try {
    const h = await w.showDirectoryPicker({ mode: 'readwrite' });
    await handles.set(h);
    return h;
  } catch {
    return null; // anulowano
  }
}

export type PermissionResult = 'granted' | 'denied' | 'prompt';

/** `interactive` = wolno wyswietlic monit o zgode (tylko z gestu uzytkownika); w tle tylko sprawdzamy. */
export async function ensurePermission(
  dir: FsDirHandle,
  interactive: boolean,
): Promise<PermissionResult> {
  const q = (await dir.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
  if (q === 'granted' || !interactive) return q;
  return (await dir.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
}

/** Usuwa najstarsze kopie `.f2save` (wg daty w nazwie) ponad `keep`; obcych plikow nie rusza. */
export async function pruneBackups(dir: FsDirHandle, keep = BACKUP_KEEP): Promise<string[]> {
  const names: string[] = [];
  for await (const e of dir.values())
    if (e.kind === 'file' && BACKUP_RE.test(e.name)) names.push(e.name);
  names.sort();
  const drop = names.slice(0, Math.max(0, names.length - keep));
  for (const n of drop) await dir.removeEntry(n);
  return drop;
}

export type AutoBackupOutcome =
  | { ok: true; file: string; pruned: string[] }
  | { ok: false; reason: 'no-folder' | 'permission' | 'failed' };

/** Zapisuje kopie wszystkich zapisow do wybranego folderu i przycina stare. */
export async function runAutoBackup(
  store: SaveStore,
  handles: HandleStore,
  opts: { interactive?: boolean; now?: Date } = {},
): Promise<AutoBackupOutcome> {
  const dir = await handles.get();
  if (!dir) return { ok: false, reason: 'no-folder' };
  const now = opts.now ?? new Date();
  try {
    if ((await ensurePermission(dir, opts.interactive ?? false)) !== 'granted') {
      return { ok: false, reason: 'permission' };
    }
    const blob = await exportAllSaves(store, { app: 'fallout2-web', now: now.getTime() });
    const file = backupFileName(now);
    const w = await (await dir.getFileHandle(file, { create: true })).createWritable();
    await w.write(blob);
    await w.close();
    const pruned = await pruneBackups(dir);
    return { ok: true, file, pruned };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export function shouldAutoBackup(
  lastMs: number | null,
  nowMs: number,
  minInterval = AUTO_BACKUP_MIN_INTERVAL_MS,
): boolean {
  return lastMs === null || !Number.isFinite(lastMs) || nowMs - lastMs >= minInterval;
}

export function loadLastBackup(): number | null {
  try {
    const v = Number(localStorage.getItem(LAST_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveLastBackup(ms: number): void {
  try {
    localStorage.setItem(LAST_KEY, String(ms));
  } catch {
    /* ignoruj */
  }
}

const DB = 'f2-autobackup';
const STORE = 'handles';

/** Domyslny magazyn uchwytu w IndexedDB (jeden klucz). */
export function idbHandleStore(): HandleStore {
  const open = (): Promise<IDBDatabase> =>
    new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  const tx = async <T>(
    mode: IDBTransactionMode,
    f: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await open();
    return new Promise((res, rej) => {
      const req = f(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  };
  return {
    get: async () => {
      try {
        return ((await tx('readonly', (s) => s.get('dir'))) as FsDirHandle | undefined) ?? null;
      } catch {
        return null;
      }
    },
    set: async (h) => {
      try {
        await (h
          ? tx('readwrite', (s) => s.put(h, 'dir'))
          : tx('readwrite', (s) => s.delete('dir')));
      } catch {
        /* brak IDB */
      }
    },
  };
}
