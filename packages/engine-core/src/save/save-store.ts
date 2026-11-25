import { migrate } from './migrations.js';
import { isValidSlot, type SaveError, type SaveGame, type SaveMeta } from './schema.js';

/** Abstrakcja magazynu (IndexedDB w przegladarce, pamiec w Node/testach). */
export interface SaveBackend {
  get(slot: string): Promise<unknown | null>;
  put(slot: string, value: unknown): Promise<void>;
  remove(slot: string): Promise<void>;
  all(): Promise<unknown[]>;
}

export class MemorySaveBackend implements SaveBackend {
  private m = new Map<string, unknown>();
  async get(slot: string): Promise<unknown | null> {
    return this.m.has(slot) ? structuredClone(this.m.get(slot)) : null;
  }
  async put(slot: string, value: unknown): Promise<void> {
    this.m.set(slot, structuredClone(value));
  }
  async remove(slot: string): Promise<void> {
    this.m.delete(slot);
  }
  async all(): Promise<unknown[]> {
    return [...this.m.values()].map((v) => structuredClone(v));
  }
}

/** Adapter IndexedDB (baza `f2-saves`, store `saves`, klucz = slot). Dziala tylko w przegladarce. */
export class IndexedDbSaveBackend implements SaveBackend {
  private dbp: Promise<IDBDatabase> | null = null;
  constructor(private readonly dbName = 'f2-saves') {}
  private db(): Promise<IDBDatabase> {
    this.dbp ??= new Promise((res, rej) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('saves');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    return this.dbp;
  }
  private async run<T>(
    mode: IDBTransactionMode,
    fn: (s: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.db();
    return new Promise((res, rej) => {
      const r = fn(db.transaction('saves', mode).objectStore('saves'));
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async get(slot: string): Promise<unknown | null> {
    return (await this.run('readonly', (s) => s.get(slot))) ?? null;
  }
  async put(slot: string, value: unknown): Promise<void> {
    await this.run('readwrite', (s) => s.put(value, slot));
  }
  async remove(slot: string): Promise<void> {
    await this.run('readwrite', (s) => s.delete(slot));
  }
  async all(): Promise<unknown[]> {
    return this.run('readonly', (s) => s.getAll());
  }
}

export class SaveStore {
  constructor(private readonly backend: SaveBackend) {}

  /** Meta wszystkich czytelnych zapisow, najnowsze pierwsze. */
  async list(): Promise<SaveMeta[]> {
    const metas: SaveMeta[] = [];
    for (const raw of await this.backend.all()) {
      const r = migrate(raw);
      if (!('error' in r)) metas.push(r.meta);
    }
    return metas.sort((a, b) => b.realTime - a.realTime);
  }

  async write(slot: string, save: SaveGame): Promise<void> {
    if (!isValidSlot(slot)) throw new RangeError(`nieprawidlowy slot: ${slot}`);
    await this.backend.put(slot, { ...save, meta: { ...save.meta, slot } });
  }

  async read(slot: string): Promise<SaveGame | null> {
    const r = await this.readChecked(slot);
    return r && !('error' in r) ? r : null;
  }

  /** null gdy brak slotu; blad gdy zapis uszkodzony/nowszy. */
  async readChecked(slot: string): Promise<SaveGame | SaveError | null> {
    const raw = await this.backend.get(slot);
    return raw === null ? null : migrate(raw);
  }

  async delete(slot: string): Promise<void> {
    await this.backend.remove(slot);
  }
}
