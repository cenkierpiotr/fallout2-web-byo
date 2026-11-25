import { describe, expect, it } from 'vitest';
import { parseGenrepTxt, parseKarmavarTxt } from './karma-txt.js';

describe('karma-txt', () => {
  it('genrep sortuje malejaco', () => {
    expect(parseGenrepTxt('250, 3003\n1000, 3000\n-2147483648, 3008')).toEqual([
      { threshold: 1000, nameMsg: 3000 },
      { threshold: 250, nameMsg: 3003 },
      { threshold: -2147483648, nameMsg: 3008 },
    ]);
  });
  it('karmavar', () => {
    expect(parseKarmavarTxt('0, 48, 1000, 1100')).toEqual([
      { gvar: 0, pic: 48, nameMsg: 1000, descriptionMsg: 1100 },
    ]);
  });
});
