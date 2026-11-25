import { describe, expect, it } from 'vitest';
// @ts-expect-error modul .mjs bez typow
import { violations } from '../../scripts/guard-no-game-files.mjs';

describe('straznik plikow gry', () => {
  it('przepuszcza kod i UI i18n', () => {
    expect(
      violations(['apps/web/src/app.tsx', 'apps/web/src/i18n/pl.json', 'i18n/glossary.json']),
    ).toEqual([]);
  });
  it('blokuje pliki gry i pakiety PL', () => {
    const v = violations([
      'master.dat',
      'art/x.FRM',
      'text/english/game/a.msg',
      'i18n/work/pl.json',
      'game/readme.txt',
    ]);
    expect(v).toHaveLength(5);
  });
});
