import { describe, expect, it } from 'vitest';
import { Perk } from '@f2/rules';
import { defaultSheet } from './save-world';
import { sheetDialogIq, sheetHasEmpathy } from './dialog-perks';

describe('perki w dialogu', () => {
  it('Smooth Talker dodaje range do IN opcji dialogu, Empathy wlacza kolory', () => {
    const sheet = defaultSheet();
    const base = sheetDialogIq(sheet);
    sheet.perks[Perk.SmoothTalker] = 2;
    expect(sheetDialogIq(sheet)).toBe(base + 2);
    expect(sheetHasEmpathy(sheet)).toBe(false);
    sheet.perks[Perk.Empathy] = 1;
    expect(sheetHasEmpathy(sheet)).toBe(true);
  });
});
