import { describe, expect, it, vi } from 'vitest';
import pl from './pl.json';
import en from './en.json';
import { setLocale, t } from './index';

describe('i18n', () => {
  it('pl.json i en.json maja identyczne zbiory kluczy', () => {
    expect(Object.keys(pl).sort()).toEqual(Object.keys(en).sort());
  });

  it('wstawia parametry', () => {
    setLocale('pl');
    expect(t('folder.missing', { file: 'CRITTER.DAT' })).toContain('CRITTER.DAT');
    setLocale('en');
    expect(t('folder.copying', { done: 3, total: 9 })).toContain('3');
  });

  it('brak klucza zwraca klucz i ostrzega raz', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(t('nie.ma.takiego')).toBe('nie.ma.takiego');
    expect(t('nie.ma.takiego')).toBe('nie.ma.takiego');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
