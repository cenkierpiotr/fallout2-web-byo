// Questy i holodyski (R17-U4, D). Pipboy 0x497bd8: wpis quest widoczny gdy gvars[gvar] >= display
// (rec+0xc <= gvars[rec+8]), kolor 'ukonczony' (0x40) gdy gvars[gvar] >= completed (rec+0x10), inaczej
// normalny. Hidden ma pierwszenstwo przed completed. Holodysk (lista 0x498c40): widoczny gdy
// gvars[rec+0] != 0 (rec+4 tytul msg, rec+8 baza tekstu msg).
export interface QuestRule {
  gvar: number;
  displayThreshold: number;
  completedThreshold: number;
}
export type QuestStatus = 'hidden' | 'active' | 'completed';

export function questStatus(def: QuestRule, gvarValue: number): QuestStatus {
  if (gvarValue < def.displayThreshold) return 'hidden';
  if (gvarValue >= def.completedThreshold) return 'completed';
  return 'active';
}

export function holodiskVisible(_def: { gvar: number }, gvarValue: number): boolean {
  return gvarValue !== 0;
}
