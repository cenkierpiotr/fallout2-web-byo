import { Perk, Stat, dialogIntelligence, statLevel } from '@f2/rules';
import { createSheetCritter } from './sheet-critter';
import type { PlayerSheet } from './save-world';

/**
 * Perki gracza w dialogu (D, silnik gry): Smooth Talker (0x45aa88) podnosi IN uzywane do progow opcji
 * giq_option o range perku; Empathy (0x446e13 w 0x446d30) wlacza kolorowanie opcji wg reakcji.
 */
export function sheetDialogIq(sheet: PlayerSheet): number {
  const c = createSheetCritter(() => sheet);
  return dialogIntelligence(c, statLevel(c, Stat.Intelligence));
}

export function sheetHasEmpathy(sheet: PlayerSheet): boolean {
  return (sheet.perks[Perk.Empathy] ?? 0) > 0;
}
