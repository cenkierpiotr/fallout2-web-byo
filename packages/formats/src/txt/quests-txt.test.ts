import { describe, expect, it } from 'vitest';
import { parseCsvLines, parseHolodiskTxt, parseQuestsTxt } from './quests-txt.js';

describe('parseCsvLines', () => {
  it('pomija komentarze i puste, obsluguje ujemne i komentarz inline', () => {
    expect(parseCsvLines('# c\n\n1, 2 # x\n-2147483648,3\n#214, 400, 1000\n')).toEqual([
      [1, 2],
      [-2147483648, 3],
    ]);
  });
  it('zla liczba: blad z numerem linii', () => {
    expect(() => parseCsvLines('1,2\n3,x\n')).toThrow(/linia 2/);
  });
});

describe('parseQuestsTxt / parseHolodiskTxt', () => {
  it('quests', () => {
    expect(parseQuestsTxt('1500, 100, 9, 2, 6')[0]).toEqual({
      locationMsg: 1500,
      descriptionMsg: 100,
      gvar: 9,
      displayThreshold: 2,
      completedThreshold: 6,
    });
  });
  it('za malo kolumn', () => {
    expect(() => parseQuestsTxt('1,2,3')).toThrow(/quests\.txt/);
  });
  it('holodisk pomija zakomentowany wiersz', () => {
    expect(parseHolodiskTxt('#214, 400, 1000\n220, 401, 2000\n')).toEqual([
      { gvar: 220, titleMsg: 401, textMsg: 2000 },
    ]);
  });
});
