import type { InputProfile } from './profile.js';

export interface ProfileEnv {
  pointerCoarse: boolean;
  maxTouchPoints: number;
  width: number;
}

export type ProfileSetting = 'auto' | InputProfile;

/** Szerokosc (CSS px), od ktorej urzadzenie dotykowe uznajemy za duze (desktop + gesty). */
export const TOUCH_MAX_WIDTH = 1024;

/**
 * Wykrywanie profilu: `pointer: coarse` + `maxTouchPoints` + rozmiar ekranu.
 * Hybrid = wyglad desktop + wlaczone gesty (laptop z dotykiem, duzy tablet).
 */
export function detectInputProfile(env: ProfileEnv): InputProfile {
  if (env.maxTouchPoints <= 0) return 'desktop';
  if (env.pointerCoarse && env.width < TOUCH_MAX_WIDTH) return 'touch';
  return 'hybrid';
}

export function resolveProfile(setting: ProfileSetting, env: ProfileEnv): InputProfile {
  return setting === 'auto' ? detectInputProfile(env) : setting;
}

/** Odwzorowanie na profil wygladu (ThemeProvider.setProfile) i flage gestow. */
export function toUiProfile(p: InputProfile): { profile: 'desktop' | 'touch'; gestures: boolean } {
  return { profile: p === 'touch' ? 'touch' : 'desktop', gestures: p !== 'desktop' };
}

export function readProfileEnv(win: Window): ProfileEnv {
  return {
    pointerCoarse: win.matchMedia('(pointer: coarse)').matches,
    maxTouchPoints: win.navigator.maxTouchPoints,
    width: win.innerWidth,
  };
}

// --- Wariant srodowiska uzywany przez ekran mapy (m2): coarsePointer zamiast pointerCoarse. ---

export type ProfileName = InputProfile;

export interface DetectProfileEnv {
  coarsePointer: boolean;
  maxTouchPoints: number;
  width: number;
}

/** Szerokosc (CSS px), od ktorej urzadzenie z gruboziarnistym wskaznikiem traktujemy jako hybrydowe (tablet z klawiatura). */
const HYBRID_MIN_WIDTH = 1024;

export function detectProfile(env: DetectProfileEnv): ProfileName {
  if (env.coarsePointer) return env.width >= HYBRID_MIN_WIDTH ? 'hybrid' : 'touch';
  if (env.maxTouchPoints > 0) return 'hybrid';
  return 'desktop';
}
