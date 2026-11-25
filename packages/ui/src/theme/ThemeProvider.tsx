import { createContext, type ComponentChildren } from 'preact';
import { useContext, useLayoutEffect, useMemo, useState } from 'preact/hooks';

export type ThemeName = 'modern' | 'retro' | 'high-contrast';
export type ProfileName = 'desktop' | 'touch';

export const defaultTheme: ThemeName = 'modern';
export const defaultProfile: ProfileName = 'desktop';
export const defaultFontScale = 1;
export const FONT_SCALE_MIN = 0.85;
export const FONT_SCALE_MAX = 1.6;

export interface ThemeApi {
  theme: ThemeName;
  profile: ProfileName;
  fontScale: number;
  setTheme(theme: ThemeName): void;
  setProfile(profile: ProfileName): void;
  setFontScale(scale: number): void;
}

const ThemeContext = createContext<ThemeApi | undefined>(undefined);

export function clampFontScale(n: number): number {
  if (!Number.isFinite(n)) return defaultFontScale;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n));
}

export interface ThemeProviderProps {
  theme?: ThemeName;
  profile?: ProfileName;
  fontScale?: number;
  children?: ComponentChildren;
}

/** Propsy to wartosci poczatkowe; zmiany w trakcie przez useTheme(). Ustawia atrybuty na <html>. */
export function ThemeProvider({
  theme: theme0 = defaultTheme,
  profile: profile0 = defaultProfile,
  fontScale: scale0 = defaultFontScale,
  children,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<ThemeName>(theme0);
  const [profile, setProfile] = useState<ProfileName>(profile0);
  const [fontScale, setScale] = useState(clampFontScale(scale0));

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset['theme'] = theme;
    root.dataset['profile'] = profile;
    root.style.setProperty('--font-scale', String(fontScale));
  }, [theme, profile, fontScale]);

  const api = useMemo<ThemeApi>(
    () => ({
      theme,
      profile,
      fontScale,
      setTheme,
      setProfile,
      setFontScale: (n: number) => setScale(clampFontScale(n)),
    }),
    [theme, profile, fontScale],
  );

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
