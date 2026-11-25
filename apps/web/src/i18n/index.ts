import { signal } from '@preact/signals';
import pl from './pl.json';
import en from './en.json';
import frPl from './firstrun-pl.json';
import frEn from './firstrun-en.json';
import diagPl from './diagnostics-pl.json';
import diagEn from './diagnostics-en.json';

export type Locale = 'pl' | 'en';

const dictionaries: Record<Locale, Record<string, string>> = {
  pl: { ...pl, ...frPl, ...diagPl },
  en: { ...en, ...frEn, ...diagEn },
};

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem('locale');
    if (saved === 'pl' || saved === 'en') return saved;
  } catch {
    /* brak localStorage */
  }
  const lang = typeof navigator !== 'undefined' ? navigator.language : '';
  return lang.startsWith('pl') ? 'pl' : 'en';
}

export const locale = signal<Locale>(initialLocale());

export function setLocale(l: Locale): void {
  locale.value = l;
  try {
    localStorage.setItem('locale', l);
  } catch {
    /* ignoruj */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}

const warned = new Set<string>();

/** Brak klucza: zwraca klucz i ostrzega raz. Czyta locale.value, wiec komponenty odswiezaja sie. */
export function t(key: string, params?: Record<string, string | number>): string {
  const template = dictionaries[locale.value][key];
  if (template === undefined) {
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`i18n: brak klucza "${key}"`);
    }
    return key;
  }
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m,
  );
}
