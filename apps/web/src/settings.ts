import { signal, type Signal } from '@preact/signals';
import type { ProfileName } from '@f2/input';
import { resolveFixes, type FixFlags } from '@f2/rules';
import type { Locale } from './i18n';

export interface Settings {
  locale: Locale;
  inputProfile: ProfileName | 'auto';
  /** Tryb grafiki: oryginal / baza xBRZ / HD (przelacznik w Z16). */
  hdMode: 'original' | 'base' | 'hd';
  alwaysRun: boolean;
  defaultZoom: number;
  debugOverlay: boolean;
  /** Glosnosc 0..1 (master/music/sfx/speech), krzywa v*v w mikserze. */
  volume: { master: number; music: number; sfx: number; speech: number };
  /** Etykiety wymagan (IQ) przy opcjach dialogu. */
  showSkillChecks: boolean;
  /** Pakiet tekstow gry: auto = jak jezyk interfejsu, english = oryginal, polish = pakiet PL. */
  gameTextLanguage: 'auto' | 'english' | 'polish';
  /** Trudnosc gry i walki: 0 latwa, 1 normalna, 2 trudna (SaveSettings). */
  gameDifficulty: 0 | 1 | 2;
  combatDifficulty: 0 | 1 | 2;
  /** Tempo gry: mnoznik kroku symulacji (SPEED_FACTOR). */
  gameSpeed: GameSpeed;
  /** Nadpisania poprawek `rules.fixes.<id>` (ADR-0004); brak wpisu = domyslnie. */
  fixes: Record<string, boolean>;
  /** Tryb klasyczny: zachowanie oryginalu, wszystkie poprawki wylaczone. */
  classicMode: boolean;
  /** Skala interfejsu (mnoznik rozmiaru czcionki i celow dotyku), UI_SCALE_MIN..UI_SCALE_MAX. */
  uiScale: number;
  /** Preset jakosci renderera (packages/render/quality); 'auto' = wg urzadzenia. */
  graphicsPreset: 'niski' | 'sredni' | 'wysoki' | 'ultra' | 'retro' | 'auto';
  /** Post-fx (bloom, winieta, ziarno, CRT): domyslnie wylaczone. */
  postFx: boolean;
  /** Oswietlenie 2.5D (slonce, normalne, parallax wg presetu): domyslnie wylaczone. */
  lighting: boolean;
  /** Eksperymentalny render w workerze (OffscreenCanvas): domyslnie wylaczony. */
  renderWorker: boolean;
  /**
   * Sciezka RGBA dla HD (osobne tekstury RGBA z assets-hd, wymaga hdMode != 'original'):
   * domyslnie wylaczona = render bajt w bajt jak dotad. Zmiana wymaga ponownego wejscia na mape.
   */
  hdRgba: boolean;
  /** Filtr tekstur HD: liniowy (gladki) albo nearest (piksel). */
  hdFilter: 'linear' | 'nearest';
  /** Czy kafle podlogi tez maja miec HD (domyslnie nie: HD glownie dla obiektow, scenerii, krytterow). */
  hdTiles: boolean;
}

export type GameSpeed = 'slow' | 'normal' | 'fast';
export const SPEED_FACTOR: Readonly<Record<GameSpeed, number>> = {
  slow: 0.75,
  normal: 1,
  fast: 1.5,
};

/** Koncowe flagi regul z ustawien (domyslnie wlaczone, nadpisania, tryb klasyczny). */
export function effectiveFixes(s: Pick<Settings, 'fixes' | 'classicMode'>): FixFlags {
  return resolveFixes(s.fixes, s.classicMode);
}

export const UI_SCALE_MIN = 0.75;
export const UI_SCALE_MAX = 1.5;
/** Predefiniowane skale w kroku onboardingu (mala, normalna, duza). */
export const UI_SCALE_PRESETS = [0.85, 1, 1.25] as const;

export function clampUiScale(v: unknown, def = 1): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, v))
    : def;
}

/** Ustawia `--ui-scale` na elemencie glownym (CSS mnozy przez nia czcionke i cele dotyku). */
export function applyUiScale(
  root: { style: { setProperty(n: string, v: string): void } },
  scale: number,
): void {
  root.style.setProperty('--ui-scale', String(clampUiScale(scale)));
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'pl',
  inputProfile: 'auto',
  hdMode: 'hd',
  alwaysRun: false,
  defaultZoom: 1,
  debugOverlay: false,
  volume: { master: 0.7, music: 0.7, sfx: 0.7, speech: 0.9 },
  showSkillChecks: true,
  gameTextLanguage: 'auto',
  gameDifficulty: 1,
  combatDifficulty: 1,
  gameSpeed: 'normal',
  fixes: {},
  classicMode: false,
  uiScale: 1,
  graphicsPreset: 'auto',
  postFx: true,
  lighting: true,
  renderWorker: false,
  hdRgba: true,
  hdFilter: 'linear',
  hdTiles: true,
};

const KEY = 'f2-settings';
const VER_KEY = 'f2-settings-v';
const SETTINGS_VER = '2';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      let p = JSON.parse(raw) as Partial<Settings>;
      // Jednorazowa migracja ze starych domyslnych (original/false) do pelnej jakosci HD.
      if (localStorage.getItem(VER_KEY) !== SETTINGS_VER) {
        p = {
          ...p,
          hdMode: 'hd',
          hdRgba: true,
          hdTiles: true,
          postFx: true,
          lighting: true,
        };
        const migrated = normalizeSettings(p);
        localStorage.setItem(KEY, JSON.stringify(migrated));
        localStorage.setItem(VER_KEY, SETTINGS_VER);
        return migrated;
      }
      return normalizeSettings(p);
    }
  } catch {
    /* brak localStorage albo uszkodzony JSON */
  }
  return { ...DEFAULT_SETTINGS };
}

const oneOf = <T>(v: unknown, list: readonly T[], def: T): T =>
  list.includes(v as T) ? (v as T) : def;
const clamp01 = (v: unknown, def: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : def;

/** Scala zapis z localStorage z domyslnymi, odrzucajac bledne wartosci. */
export function normalizeSettings(p: Partial<Settings>): Settings {
  const d = DEFAULT_SETTINGS;
  const fixes: Record<string, boolean> = {};
  if (p.fixes && typeof p.fixes === 'object')
    for (const [k, v] of Object.entries(p.fixes)) if (typeof v === 'boolean') fixes[k] = v;
  return {
    ...d,
    ...p,
    hdMode: oneOf(p.hdMode, ['original', 'base', 'hd'] as const, d.hdMode),
    gameTextLanguage: oneOf(
      p.gameTextLanguage,
      ['auto', 'english', 'polish'] as const,
      d.gameTextLanguage,
    ),
    gameDifficulty: oneOf(p.gameDifficulty, [0, 1, 2] as const, d.gameDifficulty),
    combatDifficulty: oneOf(p.combatDifficulty, [0, 1, 2] as const, d.combatDifficulty),
    gameSpeed: oneOf(p.gameSpeed, ['slow', 'normal', 'fast'] as const, d.gameSpeed),
    classicMode: typeof p.classicMode === 'boolean' ? p.classicMode : d.classicMode,
    uiScale: clampUiScale(p.uiScale, d.uiScale),
    graphicsPreset: oneOf(
      p.graphicsPreset,
      ['niski', 'sredni', 'wysoki', 'ultra', 'retro', 'auto'] as const,
      d.graphicsPreset,
    ),
    postFx: typeof p.postFx === 'boolean' ? p.postFx : d.postFx,
    lighting: typeof p.lighting === 'boolean' ? p.lighting : d.lighting,
    renderWorker: typeof p.renderWorker === 'boolean' ? p.renderWorker : d.renderWorker,
    hdRgba: typeof p.hdRgba === 'boolean' ? p.hdRgba : d.hdRgba,
    hdFilter: oneOf(p.hdFilter, ['linear', 'nearest'] as const, d.hdFilter),
    hdTiles: typeof p.hdTiles === 'boolean' ? p.hdTiles : d.hdTiles,
    fixes,
    volume: {
      master: clamp01(p.volume?.master, d.volume.master),
      music: clamp01(p.volume?.music, d.volume.music),
      sfx: clamp01(p.volume?.sfx, d.volume.sfx),
      speech: clamp01(p.volume?.speech, d.volume.speech),
    },
  };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.setItem(VER_KEY, SETTINGS_VER);
  } catch {
    /* ignoruj */
  }
}

/**
 * Klucze nadpisywane per profil (reszta jest globalna). Globalne ustawienia sa domyslnymi dla profilu:
 * brak nadpisania = wartosc globalna. Jezyk interfejsu obsluguje state/profiles.ts (sygnal `locale`).
 */
export const PROFILE_SETTING_KEYS = ['gameTextLanguage', 'fixes', 'classicMode'] as const;
type ProfileKey = (typeof PROFILE_SETTING_KEYS)[number];

let globalSettings: Settings = loadSettings();
let overrides: Partial<Pick<Settings, ProfileKey>> = {};
let overrideSink: ((patch: Record<string, unknown>) => void) | null = null;

const effective = (): Settings => normalizeSettings({ ...globalSettings, ...overrides });

/** Ustawienia jako sygnal (efektywne: globalne + nadpisania profilu); zapis idzie przez `update`. */
export const settings: Signal<Settings> = signal(effective());

/**
 * Podlacza nadpisania aktywnego profilu (null = brak profilu, wszystko globalne).
 * `sink` dostaje zmiany kluczy profilowych do zapisania w profilu.
 */
export function setProfileOverrides(
  o: Record<string, unknown> | null,
  sink: ((patch: Record<string, unknown>) => void) | null = null,
): void {
  const next: Record<string, unknown> = {};
  if (o) for (const k of PROFILE_SETTING_KEYS) if (o[k] !== undefined) next[k] = o[k];
  overrides = pickKeys(
    normalizeSettings({ ...DEFAULT_SETTINGS, ...next }),
    Object.keys(next) as ProfileKey[],
  );
  overrideSink = o ? sink : null;
  settings.value = effective();
}

function pickKeys(s: Settings, keys: ProfileKey[]): Partial<Pick<Settings, ProfileKey>> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = s[k];
  return out as Partial<Pick<Settings, ProfileKey>>;
}

export function updateSettings(patch: Partial<Settings>): void {
  if (overrideSink) {
    const profilePatch: Record<string, unknown> = {};
    const globalPatch: Partial<Settings> = {};
    for (const [k, v] of Object.entries(patch)) {
      if ((PROFILE_SETTING_KEYS as readonly string[]).includes(k)) profilePatch[k] = v;
      else (globalPatch as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(profilePatch).length > 0) {
      overrides = { ...overrides, ...profilePatch } as typeof overrides;
      overrideSink(profilePatch);
    }
    globalSettings = { ...globalSettings, ...globalPatch };
  } else {
    globalSettings = { ...globalSettings, ...patch };
  }
  settings.value = effective();
  saveSettings(globalSettings);
}
