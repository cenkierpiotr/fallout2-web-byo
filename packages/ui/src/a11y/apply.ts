export type ColorBlindMode = 'none' | 'protan' | 'deutan' | 'tritan';

export interface A11yValues {
  fontScale: number;
  highContrast: boolean;
  colorBlind: ColorBlindMode;
  reduceMotion: boolean;
  /** Napisy mowy (flaga dla M8, na razie tylko zapamietywana). */
  speechCaptions: boolean;
}

export const defaultA11y: A11yValues = {
  fontScale: 1,
  highContrast: false,
  colorBlind: 'none',
  reduceMotion: false,
  speechCaptions: false,
};

/** Ustawia atrybuty trybow dostepnosci na elemencie glownym (wysoki kontrast i skala ida przez ThemeProvider). */
export function applyA11y(values: A11yValues, root: HTMLElement = document.documentElement): void {
  if (values.colorBlind === 'none') delete root.dataset['colorblind'];
  else root.dataset['colorblind'] = values.colorBlind;
  root.dataset['reduceMotion'] = String(values.reduceMotion);
  root.dataset['captions'] = String(values.speechCaptions);
}
