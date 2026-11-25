import { describe, expect, it } from 'vitest';
import pl from './firstrun-pl.json';
import en from './firstrun-en.json';

describe('i18n ekranu pierwszego uruchomienia', () => {
  it('PL i EN maja identyczne klucze i te same parametry', () => {
    expect(Object.keys(pl).sort()).toEqual(Object.keys(en).sort());
    const params = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(pl) as Array<keyof typeof pl>) {
      expect(params(pl[k]), k).toEqual(params(en[k]));
      expect(pl[k]).not.toContain('—');
      expect(en[k]).not.toContain('—');
    }
  });
});
