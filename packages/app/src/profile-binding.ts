import type { SettingsStore } from './settings-store.js';

export type EffectiveProfile = 'desktop' | 'touch' | 'hybrid';

export interface ProfileEnvLike {
  pointerCoarse: boolean;
  maxTouchPoints: number;
  width: number;
}

export interface ProfileBindingDeps {
  /** Srodowisko urzadzenia (czytane ponownie przy kazdej zmianie). */
  readEnv(): ProfileEnvLike;
  /** Czysta funkcja z @f2/input: resolveProfile. */
  resolve(setting: 'auto' | EffectiveProfile, env: ProfileEnvLike): EffectiveProfile;
  /** Czysta funkcja z @f2/input: toUiProfile. */
  toUi(p: EffectiveProfile): { profile: 'desktop' | 'touch'; gestures: boolean };
  /** Aplikuje wyglad (ThemeProvider.setProfile + data-profile). */
  setUiProfile(p: 'desktop' | 'touch'): void;
  /** Wlacza/wylacza gesty i remapuje akcje wejscia (ActionBus). */
  setGestures(on: boolean): void;
}

/**
 * Wiaze ustawienie `profile` z wygladem i gestami; zmiana dziala natychmiast, bez przeladowania.
 * Zwraca funkcje odpinajaca.
 */
export function bindProfile(store: SettingsStore, deps: ProfileBindingDeps): () => void {
  const apply = () => {
    const eff = deps.resolve(store.get('profile'), deps.readEnv());
    const ui = deps.toUi(eff);
    deps.setUiProfile(ui.profile);
    deps.setGestures(ui.gestures);
  };
  apply();
  return store.subscribe((key) => {
    if (key === 'profile') apply();
  });
}
