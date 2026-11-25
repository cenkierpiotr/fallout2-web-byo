/**
 * Model danych pod synchronizacje miedzy urzadzeniami (serwera NIE ma; to tylko kontrakt).
 * Slot i profil maja stabilne id, autora (deviceId), czas UTC, monotoniczny licznik `rev`, hash tresci
 * i znacznik usuniecia (tombstone zamiast twardego kasowania). Metadane sa osobno od payloadu i miniatury,
 * wiec sync porownuje metadane bez pobierania blobow.
 *
 * Auth synchronizacji (konto/token serwera) to OSOBNA warstwa; PIN profilu jest tylko lokalna blokada
 * przed przypadkowym wejsciem i nigdy nie jest synchronizowany ani nie chroni danych na serwerze.
 */
export interface SyncMeta {
  /** stabilne id rekordu: `<profileId>/<slot>` dla zapisu, `<profileId>` dla profilu */
  id: string;
  /** urzadzenie, ktore wykonalo ostatnia zmiane */
  deviceId: string;
  /** czas ostatniej zmiany, ms od epoki UTC */
  updatedAt: number;
  /** licznik zmian rekordu, rosnie o 1 przy kazdej zmianie (takze usunieciu) */
  rev: number;
  /** SHA-256 (hex) payloadu bez miniatury; '' dla tombstone */
  contentHash: string;
  deleted: boolean;
}

export type SyncKind = 'save' | 'profile';

export interface SyncChange {
  kind: SyncKind;
  meta: SyncMeta;
  /** payload (SaveGame bez miniatury / dane profilu bez PIN-u); null dla tombstone */
  payload: unknown | null;
  /** miniatura (data URL) jako osobny blob; tylko dla zapisow */
  thumbnail?: string | null;
}

export interface SyncPullResult {
  changes: SyncChange[];
  /** najwyzszy rev po stronie serwera, kursor kolejnego pull */
  cursor: number;
}

export interface SyncPushResult {
  accepted: string[];
  /** id rekordow, w ktorych serwer ma nowsze rev (konflikt do rozstrzygniecia przez klienta) */
  conflicts: string[];
}

/**
 * Przyszly zdalny backend (HTTP): pull/push po rev. Implementacja poza zakresem (decyzja: lokalne profile,
 * serwer pozniej). Porownanie: wygrywa wyzsze `rev`; przy rownym `rev` i innym `contentHash` konflikt.
 */
export interface RemoteSaveBackend {
  pull(sinceCursor: number): Promise<SyncPullResult>;
  push(changes: SyncChange[]): Promise<SyncPushResult>;
}

export type Sha256 = (text: string) => Promise<string>;

export async function defaultSha256(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
