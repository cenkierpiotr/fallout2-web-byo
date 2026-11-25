import { act, render, screen, fireEvent } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import {
  dictionaries,
  formatGameDate,
  formatNumber,
  missingKeys,
  setLocale,
  t,
  tn,
  locale,
} from '../src/i18n';
import { LanguageTab } from '../src/screens/settings/LanguageTab';

afterEach(() => {
  setLocale('pl');
  missingKeys.clear();
});

describe('i18n', () => {
  it('t interpolates params', () => {
    dictionaries.pl['test.hello'] = 'Czesc, {name} ({n})!';
    expect(t('test.hello', { name: 'Vault', n: 3 })).toBe('Czesc, Vault (3)!');
    delete dictionaries.pl['test.hello'];
  });

  it('defaults to pl', () => {
    expect(locale.value).toBe('pl');
  });

  it('tn polish plural: 1 przedmiot, 2 przedmioty, 5 przedmiotów, 22 przedmioty, 12 przedmiotów', () => {
    expect(tn('common.items', 1)).toBe('1 przedmiot');
    expect(tn('common.items', 2)).toBe('2 przedmioty');
    expect(tn('common.items', 5)).toBe('5 przedmiotów');
    expect(tn('common.items', 22)).toBe('22 przedmioty');
    expect(tn('common.items', 12)).toBe('12 przedmiotów');
    expect(tn('common.items', 14)).toBe('14 przedmiotów');
    expect(tn('common.items', 112)).toBe('112 przedmiotów');
    expect(tn('common.items', 1.5)).toBe('1.5 przedmiotu');
  });

  it('tn english plural', () => {
    setLocale('en');
    expect(tn('common.items', 1)).toBe('1 item');
    expect(tn('common.items', 2)).toBe('2 items');
    expect(tn('common.items', 0)).toBe('0 items');
  });

  it('missing key returns key and records', () => {
    expect(t('nie.ma.takiego')).toBe('nie.ma.takiego');
    expect(missingKeys.has('nie.ma.takiego')).toBe(true);
  });

  it('setLocale switches without reload (signal)', () => {
    const before = t('screen.settings.title');
    setLocale('en');
    expect(t('screen.settings.title')).toBe('Settings');
    expect(before).toBe('Ustawienia');
    expect(document.documentElement.lang).toBe('en');
  });

  it('pl.json and en.json have identical key sets', () => {
    const base = (k: string) => k.replace(/\.(one|few|many|other)$/, '');
    const bases = (d: Record<string, string>) => [...new Set(Object.keys(d).map(base))].sort();
    expect(bases(dictionaries.pl)).toEqual(bases(dictionaries.en));
    const nonPlural = (d: Record<string, string>) =>
      Object.keys(d)
        .filter((k) => !/\.(one|few|many|other)$/.test(k))
        .sort();
    expect(nonPlural(dictionaries.pl)).toEqual(nonPlural(dictionaries.en));
  });

  it('formats numbers and game dates per locale', () => {
    expect(formatGameDate({ year: 2241, month: 7, day: 25 })).toBe('25 lipca 2241');
    setLocale('en');
    expect(formatGameDate({ year: 2241, month: 7, day: 25 })).toBe('July 25, 2241');
    expect(formatNumber(1234.5)).toBe('1,234.5');
    setLocale('pl');
    expect(formatGameDate({ year: 2241, month: 7, day: 25, hour: 8, minute: 5 })).toContain(
      '08:05',
    );
  });
});

describe('LanguageTab', () => {
  it('switches interface language live and reports game text language', () => {
    const changes: string[] = [];
    const locales: string[] = [];
    render(
      <LanguageTab
        gameTextLanguage="auto"
        onGameTextLanguageChange={(v) => changes.push(v)}
        onLocaleChange={(v) => locales.push(v)}
      />,
    );
    expect(screen.getByText('Język interfejsu')).toBeTruthy();
    act(() => {
      fireEvent.change(screen.getByLabelText('Język interfejsu'), { target: { value: 'en' } });
    });
    expect(screen.getByText('Interface language')).toBeTruthy();
    expect(locales).toEqual(['en']);
    fireEvent.change(screen.getByLabelText('Game text language'), { target: { value: 'polish' } });
    expect(changes).toEqual(['polish']);
  });
});
