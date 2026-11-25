import { SaveStore } from '../save/save-store.js';
import { defaultSha256, type Sha256, type SyncChange, type SyncMeta } from '../save/sync.js';
import {
  LEGACY_PROFILE_ID,
  NamespacedSaveBackend,
  type KvBackend,
} from '../save/namespaced-backend.js';

/** Nadpisania ustawien danego profilu (jezyk, flagi rules.fixes...); brak klucza = wartosc globalna. */
export type ProfileSettings = Record<string, unknown>;

export interface Profile {
  id: string;
  name: string;
  /** kolor awatara (CSS, np. `#c0392b`) */
  color: string;
  /** krotki znak/emoji awatara; pusty = inicjal nazwy */
  avatar: string;
  createdAt: number;
  lastPlayedAt: number;
  /** PIN: blokada przed przypadkowym wejsciem, NIE zabezpieczenie (hash w tej samej przegladarce). */
  pin: { salt: string; hash: string } | null;
  settings: ProfileSettings;
  /**
   * Metadane sync (patrz save/sync.ts): `sync.id` = id profilu. Hash obejmuje nazwe, kolor, awatar i
   * ustawienia; NIE obejmuje PIN-u (lokalna blokada) ani `lastPlayedAt` (lokalne).
   * `sync.deleted` = tombstone po usunieciu profilu.
   */
  sync: SyncMeta;
}

export type ProfileSummary = Omit<Profile, 'pin' | 'sync'> & { hasPin: boolean; rev: number };

export type ProfileErrorCode =
  'name-invalid' | 'name-taken' | 'not-found' | 'pin-wrong' | 'pin-invalid';

export class ProfileError extends Error {
  constructor(readonly code: ProfileErrorCode) {
    super(code);
    this.name = 'ProfileError';
  }
}

export type ActivateResult = 'ok' | 'pin-required' | 'pin-wrong' | 'not-found';

export interface ProfileStoreDeps {
  now?: () => number;
  randomId?: () => string;
  /** SHA-256 (hex) z tekstu; domyslnie Web Crypto. */
  sha256?: Sha256;
  /** id urzadzenia-autora zmian (sync); domyslnie `local` */
  deviceId?: string;
}

export const PROFILE_COLORS = [
  '#c0392b',
  '#d68910',
  '#27ae60',
  '#2980b9',
  '#8e44ad',
  '#16a085',
] as const;
export const MAX_PROFILE_NAME = 24;
const ACTIVE_KEY = '__active';
const REC = 'p:';

function defaultRandomId(): string {
  const c = globalThis.crypto;
  return Array.from(c.getRandomValues(new Uint8Array(8)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

export function validPin(pin: string): boolean {
  return /^[0-9]{4,8}$/.test(pin);
}

/**
 * Lokalne profile uzytkownikow. Rekordy profili w `profilesKv` (osobna baza), zapisy gry wszystkich
 * profili we wspolnym `savesKv`, rozdzielone przestrzeniami nazw (NamespacedSaveBackend).
 */
export class ProfileStore {
  private readonly now: () => number;
  private readonly randomId: () => string;
  private readonly sha256: Sha256;
  private readonly deviceId: string;

  constructor(
    private readonly profilesKv: KvBackend,
    private readonly savesKv: KvBackend,
    deps: ProfileStoreDeps = {},
  ) {
    this.now = deps.now ?? (() => Date.now());
    this.randomId = deps.randomId ?? defaultRandomId;
    this.sha256 = deps.sha256 ?? defaultSha256;
    this.deviceId = deps.deviceId ?? 'local';
  }

  private async all(): Promise<Profile[]> {
    const out: Profile[] = [];
    for (const [k, v] of await this.profilesKv.entries())
      if (k.startsWith(REC) && v && typeof v === 'object' && !(v as Profile).sync.deleted)
        out.push(v as Profile);
    return out;
  }

  private async load(id: string): Promise<Profile> {
    const p = (await this.profilesKv.get(REC + id)) as Profile | null;
    if (!p || p.sync.deleted) throw new ProfileError('not-found');
    return p;
  }

  /** Zapis ze zmiana tresci: podbija rev, ustawia autora, czas i hash (tombstone: hash pusty). */
  private async save(p: Profile, deleted = false): Promise<void> {
    const prev = (await this.profilesKv.get(REC + p.id)) as Profile | null;
    p.sync = {
      id: p.id,
      deviceId: this.deviceId,
      updatedAt: this.now(),
      rev: (prev?.sync.rev ?? 0) + 1,
      contentHash: deleted ? '' : await this.sha256(this.contentOf(p)),
      deleted,
    };
    await this.profilesKv.put(REC + p.id, p);
  }

  /** Zapis bez zmiany tresci synchronizowanej (lastPlayedAt, PIN): rev bez zmian. */
  private saveLocal(p: Profile): Promise<void> {
    return this.profilesKv.put(REC + p.id, p);
  }

  private contentOf(p: Profile): string {
    return JSON.stringify({ n: p.name, c: p.color, a: p.avatar, s: p.settings });
  }

  private static summary(p: Profile): ProfileSummary {
    const { pin, sync, ...rest } = p;
    return { ...rest, hasPin: pin !== null, rev: sync.rev };
  }

  private async checkName(raw: string, exceptId?: string): Promise<string> {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (name.length < 1 || name.length > MAX_PROFILE_NAME) throw new ProfileError('name-invalid');
    const low = name.toLowerCase();
    if ((await this.all()).some((p) => p.id !== exceptId && p.name.toLowerCase() === low))
      throw new ProfileError('name-taken');
    return name;
  }

  /** Najpozniej grane pierwsze. */
  async list(): Promise<ProfileSummary[]> {
    return (await this.all())
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt || a.createdAt - b.createdAt)
      .map(ProfileStore.summary);
  }

  async get(id: string): Promise<ProfileSummary | null> {
    const p = (await this.profilesKv.get(REC + id)) as Profile | null;
    return p && !p.sync.deleted ? ProfileStore.summary(p) : null;
  }

  async create(opts: {
    name: string;
    color?: string;
    avatar?: string;
    pin?: string;
    /** wymuszone id (np. `default` dla zapisow sprzed profili) */
    id?: string;
    settings?: ProfileSettings;
  }): Promise<ProfileSummary> {
    const name = await this.checkName(opts.name);
    if (opts.pin !== undefined && !validPin(opts.pin)) throw new ProfileError('pin-invalid');
    const t = this.now();
    const count = (await this.all()).length;
    const p: Profile = {
      id: opts.id ?? this.randomId(),
      name,
      color: opts.color ?? PROFILE_COLORS[count % PROFILE_COLORS.length]!,
      avatar: (opts.avatar ?? '').slice(0, 2),
      createdAt: t,
      lastPlayedAt: t,
      pin: null,
      settings: { ...opts.settings },
      sync: { id: '', deviceId: '', updatedAt: 0, rev: 0, contentHash: '', deleted: false },
    };
    if (opts.pin !== undefined) p.pin = await this.makePin(opts.pin);
    await this.save(p);
    return ProfileStore.summary(p);
  }

  /** Pierwsze uruchomienie: gdy brak profili tworzy `default` (widzi zapisy sprzed profili) i go aktywuje. */
  async ensureDefault(name: string): Promise<void> {
    if ((await this.all()).length > 0) return;
    await this.create({ name, id: LEGACY_PROFILE_ID });
    await this.profilesKv.put(ACTIVE_KEY, LEGACY_PROFILE_ID);
  }

  async rename(id: string, raw: string): Promise<void> {
    const p = await this.load(id);
    p.name = await this.checkName(raw, id);
    await this.save(p);
  }

  async update(id: string, patch: { color?: string; avatar?: string }): Promise<void> {
    const p = await this.load(id);
    if (patch.color !== undefined) p.color = patch.color;
    if (patch.avatar !== undefined) p.avatar = patch.avatar.slice(0, 2);
    await this.save(p);
  }

  /** Kasuje profil razem z jego zapisami; potwierdzenie to rola UI. */
  async remove(id: string): Promise<void> {
    const p = await this.load(id);
    await new NamespacedSaveBackend(this.savesKv, id, this.syncOpts()).clear();
    // tombstone zamiast twardego usuniecia (sync); dane osobowe (nazwa, ustawienia, PIN) czyszczone
    p.name = '';
    p.settings = {};
    p.pin = null;
    await this.save(p, true);
    if ((await this.getActiveId()) === id) await this.profilesKv.remove(ACTIVE_KEY);
  }

  private async makePin(pin: string): Promise<{ salt: string; hash: string }> {
    const salt = this.randomId() + this.randomId();
    return { salt, hash: await this.sha256(`${salt}:${pin}`) };
  }

  /** Ustawia/zmienia/usuwa (null) PIN; gdy profil ma PIN, wymaga `currentPin`. */
  async setPin(id: string, pin: string | null, currentPin?: string): Promise<void> {
    const p = await this.load(id);
    if (p.pin && !(await this.verifyPin(id, currentPin ?? ''))) throw new ProfileError('pin-wrong');
    if (pin !== null && !validPin(pin)) throw new ProfileError('pin-invalid');
    p.pin = pin === null ? null : await this.makePin(pin);
    await this.saveLocal(p);
  }

  async verifyPin(id: string, pin: string): Promise<boolean> {
    const p = await this.load(id);
    if (!p.pin) return true;
    return (await this.sha256(`${p.pin.salt}:${pin}`)) === p.pin.hash;
  }

  async getActiveId(): Promise<string | null> {
    const id = await this.profilesKv.get(ACTIVE_KEY);
    if (typeof id !== 'string') return null;
    const p = (await this.profilesKv.get(REC + id)) as Profile | null;
    return p && !p.sync.deleted ? id : null;
  }

  /** Wybor aktywnego profilu (pamietany); profil z PIN-em wymaga poprawnego `pin`. */
  async activate(id: string, pin?: string): Promise<ActivateResult> {
    const p = (await this.profilesKv.get(REC + id)) as Profile | null;
    if (!p || p.sync.deleted) return 'not-found';
    if (p.pin) {
      if (pin === undefined) return 'pin-required';
      if (!(await this.verifyPin(id, pin))) return 'pin-wrong';
    }
    p.lastPlayedAt = this.now();
    await this.saveLocal(p);
    await this.profilesKv.put(ACTIVE_KEY, id);
    return 'ok';
  }

  async touch(id: string): Promise<void> {
    const p = await this.load(id);
    p.lastPlayedAt = this.now();
    await this.saveLocal(p);
  }

  async getSettings(id: string): Promise<ProfileSettings> {
    return { ...(await this.load(id)).settings };
  }

  /** Scala nadpisania; wartosc `undefined` usuwa nadpisanie (powrot do globalnej). */
  async patchSettings(id: string, patch: ProfileSettings): Promise<void> {
    const p = await this.load(id);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete p.settings[k];
      else p.settings[k] = v;
    }
    await this.save(p);
  }

  /** Magazyn zapisow tego profilu (przestrzen nazw); podmienialny na backend serwerowy w przyszlosci. */
  saveStore(id: string): SaveStore {
    return new SaveStore(this.saveBackend(id));
  }

  /** Backend zapisow profilu z metadanymi sync (listMeta/readChange/applyRemote). */
  saveBackend(id: string): NamespacedSaveBackend {
    return new NamespacedSaveBackend(this.savesKv, id, this.syncOpts());
  }

  private syncOpts(): { deviceId: string; now: () => number; sha256: Sha256 } {
    return { deviceId: this.deviceId, now: this.now, sha256: this.sha256 };
  }

  /** Metadane profili (z tombstonami) do porownania przez sync, bez payloadow. */
  async listSyncMeta(): Promise<SyncMeta[]> {
    const out: SyncMeta[] = [];
    for (const [k, v] of await this.profilesKv.entries())
      if (k.startsWith(REC)) out.push((v as Profile).sync);
    return out.sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Zmiana profilu do wyslania: payload bez PIN-u i bez pol lokalnych. */
  async readSyncChange(id: string): Promise<SyncChange | null> {
    const p = (await this.profilesKv.get(REC + id)) as Profile | null;
    if (!p) return null;
    if (p.sync.deleted) return { kind: 'profile', meta: p.sync, payload: null };
    return {
      kind: 'profile',
      meta: p.sync,
      payload: {
        name: p.name,
        color: p.color,
        avatar: p.avatar,
        createdAt: p.createdAt,
        settings: p.settings,
      },
    };
  }

  /** Przyjmuje zmiane profilu z zewnatrz; odrzuca gdy lokalny rev >= przychodzacy. PIN zostaje lokalny. */
  async applyRemoteProfile(c: SyncChange): Promise<boolean> {
    if (c.kind !== 'profile') return false;
    const cur = (await this.profilesKv.get(REC + c.meta.id)) as Profile | null;
    if (cur && cur.sync.rev >= c.meta.rev) return false;
    const d = (c.payload ?? {}) as Partial<Profile>;
    const p: Profile = {
      id: c.meta.id,
      name: c.meta.deleted ? '' : String(d.name ?? ''),
      color: String(d.color ?? PROFILE_COLORS[0]),
      avatar: String(d.avatar ?? ''),
      createdAt: Number(d.createdAt ?? c.meta.updatedAt),
      lastPlayedAt: cur?.lastPlayedAt ?? 0,
      pin: cur?.pin ?? null,
      settings: c.meta.deleted ? {} : { ...(d.settings ?? {}) },
      sync: c.meta,
    };
    await this.profilesKv.put(REC + p.id, p);
    return true;
  }
}
