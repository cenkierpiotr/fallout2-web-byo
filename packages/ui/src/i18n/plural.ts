export type Locale = 'pl' | 'en';
export type PluralCategory = 'one' | 'few' | 'many' | 'other';

/** Kategoria liczby mnogiej wg CLDR (PL: one/few/many/other, EN: one/other). */
export function pluralCategory(locale: Locale, n: number): PluralCategory {
  const abs = Math.abs(n);
  if (locale === 'en') return abs === 1 ? 'one' : 'other';
  if (!Number.isInteger(abs)) return 'other';
  if (abs === 1) return 'one';
  const m10 = abs % 10;
  const m100 = abs % 100;
  if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return 'few';
  return 'many';
}
