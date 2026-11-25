import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseEndgameTable,
  parseEnddeathTable,
  parseHolodiskTable,
  parseQuestsTable,
} from '../src/tables/index.js';

const patch = process.env.F2_PATCH_DIR;
const game = process.env.F2_GAME_DIR;
const dataFile = (n: string) => readFileSync(join(patch!, 'DATA', 'Data', n), 'latin1');

describe('tabele: testy jednostkowe', () => {
  it('trailing komentarz po # jest ucinany', () => {
    const r = parseEndgameTable('700, 1, 471, nar_eldr #471 - killap \r\n');
    expect(r.items).toEqual([
      { gvar: 700, value: 1, art: 471, narrator: 'nar_eldr', direction: 0, line: 1 },
    ]);
    expect(r.warnings).toEqual([]);
  });
  it('kierunek tylko jako piaty argument', () => {
    const r = parseEndgameTable('# c\n\n40, 1, 327, nar_10, -1\n');
    expect(r.items[0]).toMatchObject({ art: 327, direction: -1, line: 3 });
  });
  it('malformed line goes to warnings', () => {
    const r = parseEndgameTable('abc\n1, 2\n408, 1, 440, nar_ar1\n');
    expect(r.items.length).toBe(1);
    expect(r.warnings.length).toBe(2);
    expect(r.warnings[0]).toContain('1');
  });
  it('enddeath, quests, holodisk: format i warnings', () => {
    expect(parseEnddeathTable('-1, 0, -1, 16, 0, 40, nar_dth3\nzly\n')).toEqual({
      items: [
        {
          gvar: -1,
          value: 0,
          areaKnown: -1,
          areaNotKnown: 16,
          minLevel: 0,
          chance: 40,
          narrator: 'nar_dth3',
          line: 1,
        },
      ],
      warnings: [expect.stringContaining('2')],
    });
    expect(parseQuestsTable('1500, 100, 9, 2, 6\n').items[0]).toEqual({
      locationMsg: 1500,
      descriptionMsg: 100,
      gvar: 9,
      displayThreshold: 2,
      completedThreshold: 6,
      line: 1,
    });
    expect(parseHolodiskTable('# x\n220, 401, 2000\n').items[0]).toEqual({
      gvar: 220,
      titleMsg: 401,
      textMsg: 2000,
      line: 2,
    });
    expect(parseQuestsTable('1,2,3\n').warnings.length).toBe(1);
  });
});

describe.skipIf(!patch || !game)('tabele: golden (overlay)', () => {
  it('endgame: 59 slajdow, 21 gvar, pierwszy Arroyo', () => {
    const r = parseEndgameTable(dataFile('endgame.txt'));
    expect(r.items.length).toBe(59);
    expect(new Set(r.items.map((s) => s.gvar)).size).toBe(21);
    expect(r.items[0]).toMatchObject({
      gvar: 408,
      value: 1,
      art: 440,
      narrator: 'nar_ar1',
      direction: 0,
    });
    expect(r.warnings).toEqual([]);
  });
  it('quests: 115 wpisow, pierwszy Arroyo', () => {
    const r = parseQuestsTable(dataFile('quests.txt'));
    expect(r.items.length).toBe(115);
    expect(r.items[0]).toMatchObject({
      locationMsg: 1500,
      descriptionMsg: 100,
      gvar: 9,
      displayThreshold: 2,
      completedThreshold: 6,
    });
    expect(r.warnings).toEqual([]);
  });
});
