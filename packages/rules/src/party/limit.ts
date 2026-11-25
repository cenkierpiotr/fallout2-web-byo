// Limit druzyny. Z: w oryginale egzekwowany przez skrypty (nie znaleziono w silnik gry; jedyny wywolujacy
// partyMemberAdd 0x494378 poza opkodem to inicjalizacja gracza 0x488780). Formula wg planu M6:
// floor(Charyzma / 2) + 1 z Magnetic Personality (perks.md: "limit druzyny +1").
export const MAX_CHARISMA = 10;

export function partyLimit(charisma: number, magneticPersonality: boolean): number {
  const ch = Number.isFinite(charisma)
    ? Math.min(MAX_CHARISMA, Math.max(0, Math.trunc(charisma)))
    : 0;
  return Math.floor(ch / 2) + (magneticPersonality ? 1 : 0);
}

/** `memberCount` = czlonkowie bez gracza (wpisy listy - 1). */
export function canRecruit(limit: number, memberCount: number): boolean {
  return memberCount < limit;
}
