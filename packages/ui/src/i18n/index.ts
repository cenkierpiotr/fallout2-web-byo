import { signal } from '@preact/signals';
import pl from '../../i18n/pl.json';
import en from '../../i18n/en.json';
import optionsPl from '../../i18n/options.pl.json';
import optionsEn from '../../i18n/options.en.json';
import { pluralCategory, type Locale } from './plural';

export type { Locale, PluralCategory } from './plural';
export { pluralCategory } from './plural';

export type Params = Record<string, string | number>;
export type Dictionary = Record<string, string>;

export const dictionaries: Record<Locale, Dictionary> = {
  pl: { ...pl, ...optionsPl },
  en: { ...en, ...optionsEn },
};
export const defaultLocale: Locale = 'pl';

/** Aktualny jezyk interfejsu; zmiana odswieza komponenty czytajace sygnal bez przeladowania. */
export const locale = signal<Locale>(defaultLocale);

/** Klucze, ktorych brakowalo w slowniku (do diagnostyki). */
export const missingKeys = new Set<string>();

export function setLocale(next: Locale): void {
  if (next !== 'pl' && next !== 'en') return;
  locale.value = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
}

export function isLocale(v: unknown): v is Locale {
  return v === 'pl' || v === 'en';
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m,
  );
}

function reportMissing(key: string): void {
  if (missingKeys.has(key)) return;
  missingKeys.add(key);
  if (import.meta.env?.DEV) console.warn(`[i18n] brak klucza: ${key}`);
}

/** Tlumaczenie z interpolacja `{name}`. Brak klucza: zwraca klucz i zapisuje w missingKeys. */
export function t(key: string, params?: Params): string {
  const dict = dictionaries[locale.value];
  const value = dict[key];
  if (value === undefined) {
    reportMissing(key);
    return key;
  }
  return interpolate(value, params);
}

/** Liczba mnoga: klucze `key.one|few|many|other`; `{count}` dostepne w szablonie. */
export function tn(key: string, count: number, params?: Params): string {
  const dict = dictionaries[locale.value];
  const cat = pluralCategory(locale.value, count);
  const value = dict[`${key}.${cat}`] ?? dict[`${key}.other`] ?? dict[`${key}.many`];
  if (value === undefined) {
    reportMissing(`${key}.${cat}`);
    return key;
  }
  return interpolate(value, { count, ...params });
}

const intlTag: Record<Locale, string> = { pl: 'pl-PL', en: 'en-US' };

export function formatNumber(n: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlTag[locale.value], options).format(n);
}

export interface GameDate {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour?: number;
  minute?: number;
}

/** Data gry (np. 25 lipca 2241), z godzina gdy podana. Strefa UTC, by uniknac przesuniec. */
export function formatGameDate(d: GameDate): string {
  const date = new Date(Date.UTC(2000, d.month - 1, d.day, d.hour ?? 0, d.minute ?? 0));
  date.setUTCFullYear(d.year);
  const hasTime = d.hour !== undefined;
  const fmt = new Intl.DateTimeFormat(intlTag[locale.value], {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(hasTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}),
  });
  return fmt.format(date);
}
