import { describe, expect, it } from 'vitest';
import {
  DEMO_MSG_FILES,
  buildRows,
  countFallbacks,
  placeholdersMatch,
  splitPlaceholders,
} from '../playground/msg-browser';

describe('msg-browser', () => {
  it('fallback to id z EN bez wpisu PL, tekst bierze z EN', () => {
    const rows = buildRows(DEMO_MSG_FILES[0]!);
    expect(countFallbacks(rows)).toBe(1);
    expect(rows.find((r) => r.fallback)).toMatchObject({ id: 103, pl: 'Charisma' });
  });
  it('rozbija placeholdery', () => {
    expect(splitPlaceholders('@pc@ ma %d PD')).toEqual([
      { text: '@pc@', placeholder: true },
      { text: ' ma ', placeholder: false },
      { text: '%d', placeholder: true },
      { text: ' PD', placeholder: false },
    ]);
  });
  it('porownuje placeholdery niezaleznie od kolejnosci', () => {
    expect(placeholdersMatch('%s hits %d', '%d trafia %s')).toBe(true);
    expect(placeholdersMatch('%s hits %d', '%s trafia')).toBe(false);
  });
});
