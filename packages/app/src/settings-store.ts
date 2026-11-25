/** Ustawienia uzytkownika (IndexedDB, baza `f2-settings`, magazyn `settings`). */

export type ProfileChoice = 'auto' | 'desktop' | 'touch' | 'hybrid';
export type ThemeChoice = 'modern' | 'retro' | 'high-contrast';
export type GameTextLanguageChoice = 'auto' | 'english' | 'polish';
export type ColorBlindMode = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';

export interface Settings {
  profile: ProfileChoice;
  theme: ThemeChoice;
  fontScale: number;
  language: string;
  /** 'auto' = jezyk interfejsu (patrz resolveGameTextLanguage w @f2/engine-core). */
  gameTextLanguage: GameTextLanguageChoice;
  autosave: boolean;
  showSkillCheckPercent: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
  colorBlindMode: ColorBlindMode;
}

export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  profile: 'auto',
  theme: 'modern',
  fontScale: 1,
  language: 'pl',
  gameTextLanguage: 'auto',
  autosave: true,
  showSkillCheckPercent: true,
  reduceMotion: false,
  highContrast: false,
  colorBlindMode: 'none',
};

const ENUMS = {
  profile: ['auto', 'desktop', 'touch', 'hybrid'],
  theme: ['modern', 'retro', 'high-contrast'],
  colorBlindMode: ['none', 'protanopia', 'deuteranopia', 'tritanopia'],
  gameTextLanguage: ['auto', 'english', 'polish'],
} as const;

const FONT_MIN = 0.85;
const FONT_MAX = 1.6;

/** Zwraca poprawna (znormalizowana) wartosc albo undefined, gdy nie do przyjecia. */
function sanitize<K extends SettingKey>(key: K, value: unknown): Settings[K] | undefined {
  const def = DEFAULT_SETTINGS[key];
  if (
    key === 'profile' ||
    key === 'theme' ||
    key === 'colorBlindMode' ||
    key === 'gameTextLanguage'
  ) {
    const list: readonly unknown[] = ENUMS[key as keyof typeof ENUMS];
    return list.includes(value) ? (value as Settings[K]) : undefined;
  }
  if (typeof def === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.min(FONT_MAX, Math.max(FONT_MIN, value)) as Settings[K];
  }
  if (typeof def === 'boolean')
    return typeof value === 'boolean' ? (value as Settings[K]) : undefined;
  if (typeof def === 'string') {
    return typeof value === 'string' && value.length > 0 ? (value as Settings[K]) : undefined;
  }
  return undefined;
}

export interface SettingsBackend {
  load(): Promise<Record<string, unknown>>;
  save(key: string, value: unknown): Promise<void>;
}

export class MemoryBackend implements SettingsBackend {
  constructor(private data: Record<string, unknown> = {}) {}
  load(): Promise<Record<string, unknown>> {
    return Promise.resolve({ ...this.data });
  }
  save(key: string, value: unknown): Promise<void> {
    this.data[key] = value;
    return Promise.resolve();
  }
}

const DB_NAME = 'f2-settings';
const STORE = 'settings';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB'));
  });
}

export class IndexedDbBackend implements SettingsBackend {
  private db?: Promise<IDBDatabase>;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error('IndexedDB open'));
    });
    return this.db;
  }

  async load(): Promise<Record<string, unknown>> {
    const db = await this.open();
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const keys = await req(store.getAllKeys());
    const values = await req(store.getAll());
    const out: Record<string, unknown> = {};
    keys.forEach((k, i) => {
      out[String(k)] = values[i];
    });
    return out;
  }

  async save(key: string, value: unknown): Promise<void> {
    const db = await this.open();
    await req(db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key));
  }
}

export type SettingsListener = <K extends SettingKey>(key: K, value: Settings[K]) => void;

export class SettingsStore {
  private values: Settings = { ...DEFAULT_SETTINGS };
  private listeners = new Set<SettingsListener>();

  constructor(private backend: SettingsBackend) {}

  /** Wczytuje zapisane wartosci (niepoprawne pomija) i powiadamia o zmienionych. */
  async load(): Promise<void> {
    let stored: Record<string, unknown> = {};
    try {
      stored = await this.backend.load();
    } catch {
      /* brak IndexedDB (tryb prywatny): zostaja domyslne */
    }
    for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
      if (!(key in stored)) continue;
      const v = sanitize(key, stored[key]);
      if (v !== undefined) this.apply(key, v);
    }
  }

  get<K extends SettingKey>(key: K): Settings[K] {
    return this.values[key];
  }

  snapshot(): Settings {
    return { ...this.values };
  }

  /** Zmiana jest natychmiastowa (powiadomienie synchroniczne); zapis w tle. */
  async set<K extends SettingKey>(key: K, value: Settings[K]): Promise<void> {
    const v = sanitize(key, value);
    if (v === undefined) throw new Error(`Niepoprawna wartosc ustawienia ${key}`);
    this.apply(key, v);
    try {
      await this.backend.save(key, v);
    } catch {
      /* zapis nieudany: ustawienie dziala do konca sesji */
    }
  }

  subscribe(fn: SettingsListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private apply<K extends SettingKey>(key: K, value: Settings[K]): void {
    if (this.values[key] === value) return;
    this.values[key] = value;
    for (const l of [...this.listeners]) l(key, value);
  }
}
