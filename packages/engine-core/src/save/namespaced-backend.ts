import type { SaveBackend } from './save-store.js';
import { defaultSha256, type Sha256, type SyncChange, type SyncMeta } from './sync.js';

/** Plaski magazyn klucz-wartosc pod przestrzenie nazw profili (IndexedDB w przegladarce, pamiec w testach). */
export interface KvBackend {
  get(key: string): Promise<unknown | null>;
  put(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  entries(): Promise<[string, unknown][]>;
}

export class MemoryKv implements KvBackend {
  private m = new Map<string, unknown>();
  async get(key: string): Promise<unknown | null> {
    return this.m.has(key) ? structuredClone(this.m.get(key)) : null;
  }
  async put(key: string, value: unknown): Promise<void> {
    this.m.set(key, structuredClone(value));
  }
  async remove(key: string): Promise<void> {
    this.m.delete(key);
  }
  async entries(): Promise<[string, unknown][]> {
    return [...this.m.entries()].map(([k, v]) => [k, structuredClone(v)]);
  }
}

/** IndexedDB: jedna baza, jeden store (`saves`), klucz = string. Tylko przegladarka. */
export class IndexedDbKv implements KvBackend {
  private dbp: Promise<IDBDatabase> | null = null;
  constructor(private readonly dbName: string) {}
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
  async get(key: string): Promise<unknown | null> {
    return (await this.run('readonly', (s) => s.get(key))) ?? null;
  }
  async put(key: string, value: unknown): Promise<void> {
    await this.run('readwrite', (s) => s.put(value, key));
  }
  async remove(key: string): Promise<void> {
    await this.run('readwrite', (s) => s.delete(key));
  }
  async entries(): Promise<[string, unknown][]> {
    const keys = await this.run('readonly', (s) => s.getAllKeys());
    const vals = await this.run('readonly', (s) => s.getAll());
    return keys.map((k, i) => [String(k), vals[i]]);
  }
}

/** Id profilu dla zapisow sprzed wprowadzenia profili: klucze bez prefiksu. */
export const LEGACY_PROFILE_ID = 'default';

/** Przestrzen nazw profilu; profil `default` uzywa pustej (zapisy sprzed profili zostaja widoczne). */
export function namespaceOf(profileId: string): string {
  return profileId === LEGACY_PROFILE_ID ? '' : profileId;
}

function belongs(ns: string, key: string): boolean {
  return ns === '' ? !key.includes('/') : key.startsWith(`${ns}/`);
}

export interface NamespacedOptions {
  /** id urzadzenia-autora zmian (stabilne w obrebie przegladarki); domyslnie `local` */
  deviceId?: string;
  now?: () => number;
  sha256?: Sha256;
}

/**
 * SaveBackend jednego profilu na wspolnym magazynie. Uklad kluczy:
 * - payload: `<ns>/<slot>` (legacy: samo `<slot>`), BEZ miniatury,
 * - miniatura: `t:<profileId>/<slot>` (osobny blob),
 * - metadane sync: `m:<profileId>/<slot>` (SyncMeta, takze tombstone po usunieciu).
 * Profil A nigdy nie widzi zapisow profilu B. Interfejs SaveBackend zostaje bez zmian, wiec na tym
 * samym kontrakcie mozna oprzec RemoteSaveBackend (pull/push po rev, patrz sync.ts).
 */
export class NamespacedSaveBackend implements SaveBackend {
  private readonly ns: string;
  private readonly deviceId: string;
  private readonly now: () => number;
  private readonly sha256: Sha256;
  constructor(
    private readonly kv: KvBackend,
    private readonly profileId: string,
    opts: NamespacedOptions = {},
  ) {
    if (profileId.includes('/') || profileId === '' || profileId.includes(':'))
      throw new RangeError('nieprawidlowy id profilu');
    this.ns = namespaceOf(profileId);
    this.deviceId = opts.deviceId ?? 'local';
    this.now = opts.now ?? (() => Date.now());
    this.sha256 = opts.sha256 ?? defaultSha256;
  }
  private key(slot: string): string {
    return this.ns === '' ? slot : `${this.ns}/${slot}`;
  }
  private mKey(slot: string): string {
    return `m:${this.profileId}/${slot}`;
  }
  private tKey(slot: string): string {
    return `t:${this.profileId}/${slot}`;
  }

  private static split(value: unknown): { payload: unknown; thumbnail: string | null } {
    const v = value as { meta?: { thumbnail?: unknown } } | null;
    if (v && typeof v === 'object' && v.meta && typeof v.meta === 'object') {
      const th = typeof v.meta.thumbnail === 'string' ? v.meta.thumbnail : null;
      return { payload: { ...v, meta: { ...v.meta, thumbnail: null } }, thumbnail: th };
    }
    return { payload: value, thumbnail: null };
  }

  private static join(payload: unknown, thumbnail: unknown): unknown {
    const v = payload as { meta?: object } | null;
    if (typeof thumbnail === 'string' && v && typeof v === 'object' && v.meta)
      return { ...v, meta: { ...v.meta, thumbnail } };
    return payload;
  }

  private async nextMeta(slot: string, hash: string, deleted: boolean): Promise<SyncMeta> {
    const prev = (await this.kv.get(this.mKey(slot))) as SyncMeta | null;
    return {
      id: `${this.profileId}/${slot}`,
      deviceId: this.deviceId,
      updatedAt: this.now(),
      rev: (prev?.rev ?? 0) + 1,
      contentHash: hash,
      deleted,
    };
  }

  async get(slot: string): Promise<unknown | null> {
    const payload = await this.kv.get(this.key(slot));
    if (payload === null) return null;
    return NamespacedSaveBackend.join(payload, await this.kv.get(this.tKey(slot)));
  }

  async put(slot: string, value: unknown): Promise<void> {
    const { payload, thumbnail } = NamespacedSaveBackend.split(value);
    const meta = await this.nextMeta(slot, await this.sha256(JSON.stringify(payload)), false);
    await this.kv.put(this.key(slot), payload);
    if (thumbnail !== null) await this.kv.put(this.tKey(slot), thumbnail);
    else await this.kv.remove(this.tKey(slot));
    await this.kv.put(this.mKey(slot), meta);
  }

  /** Usuniecie = tombstone (payload i miniatura znikaja, metadane z `deleted` zostaja do synchronizacji). */
  async remove(slot: string): Promise<void> {
    const had = await this.kv.get(this.key(slot));
    const hadMeta = await this.kv.get(this.mKey(slot));
    if (had === null && hadMeta === null) return;
    const meta = await this.nextMeta(slot, '', true);
    await this.kv.remove(this.key(slot));
    await this.kv.remove(this.tKey(slot));
    await this.kv.put(this.mKey(slot), meta);
  }

  async all(): Promise<unknown[]> {
    const entries = await this.kv.entries();
    const thumbs = new Map<string, unknown>();
    const tp = `t:${this.profileId}/`;
    for (const [k, v] of entries) if (k.startsWith(tp)) thumbs.set(k.slice(tp.length), v);
    const out: unknown[] = [];
    for (const [k, v] of entries) {
      if (!belongs(this.ns, k)) continue;
      const slot = this.ns === '' ? k : k.slice(this.ns.length + 1);
      out.push(NamespacedSaveBackend.join(v, thumbs.get(slot)));
    }
    return out;
  }

  /** Usuwa wszystkie zapisy przestrzeni (kasowanie profilu), zostawiajac tombstony. */
  async clear(): Promise<void> {
    for (const [k] of await this.kv.entries()) {
      if (!belongs(this.ns, k)) continue;
      await this.remove(this.ns === '' ? k : k.slice(this.ns.length + 1));
    }
  }

  /** Metadane wszystkich rekordow (z tombstonami), bez pobierania payloadow. Dolicza meta zapisom sprzed sync. */
  async listMeta(): Promise<SyncMeta[]> {
    const entries = await this.kv.entries();
    const mp = `m:${this.profileId}/`;
    const metas = new Map<string, SyncMeta>();
    for (const [k, v] of entries)
      if (k.startsWith(mp)) metas.set(k.slice(mp.length), v as SyncMeta);
    for (const [k, v] of entries) {
      if (!belongs(this.ns, k)) continue;
      const slot = this.ns === '' ? k : k.slice(this.ns.length + 1);
      if (metas.has(slot)) continue;
      const m = await this.nextMeta(
        slot,
        await this.sha256(JSON.stringify(NamespacedSaveBackend.split(v).payload)),
        false,
      );
      await this.kv.put(this.mKey(slot), m);
      metas.set(slot, m);
    }
    return [...metas.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Pelna zmiana rekordu do wyslania (payload + miniatura osobno); null gdy brak metadanych. */
  async readChange(slot: string): Promise<SyncChange | null> {
    const meta = (await this.kv.get(this.mKey(slot))) as SyncMeta | null;
    if (!meta) return null;
    if (meta.deleted) return { kind: 'save', meta, payload: null };
    const payload = await this.kv.get(this.key(slot));
    const thumb = await this.kv.get(this.tKey(slot));
    return { kind: 'save', meta, payload, thumbnail: typeof thumb === 'string' ? thumb : null };
  }

  /** Przyjmuje zmiane z zewnatrz (pull); odrzuca, gdy lokalny `rev` jest >= przychodzacemu. */
  async applyRemote(change: SyncChange): Promise<boolean> {
    const slot = change.meta.id.slice(this.profileId.length + 1);
    if (!change.meta.id.startsWith(`${this.profileId}/`) || slot === '') return false;
    const cur = (await this.kv.get(this.mKey(slot))) as SyncMeta | null;
    if (cur && cur.rev >= change.meta.rev) return false;
    if (change.meta.deleted || change.payload === null) {
      await this.kv.remove(this.key(slot));
      await this.kv.remove(this.tKey(slot));
    } else {
      await this.kv.put(this.key(slot), change.payload);
      if (typeof change.thumbnail === 'string')
        await this.kv.put(this.tKey(slot), change.thumbnail);
      else await this.kv.remove(this.tKey(slot));
    }
    await this.kv.put(this.mKey(slot), change.meta);
    return true;
  }
}
