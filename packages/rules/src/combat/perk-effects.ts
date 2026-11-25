/**
 * Pomniejsze efekty perkow walki (D z silnik gry, adresy w komentarzach).
 */

/**
 * Heave Ho! (perk 35, 0x478ac9, w 0x478a1c): zasieg rzutu (klasa 3) = min(zasieg broni z proto,
 * 3 * (ST + 2 * ranga)); ranga liczona tylko dla gracza.
 */
export function throwRange(
  weaponRange: number,
  strength: number,
  heaveHoRank: number,
  isPlayer: boolean,
): number {
  const st = strength + (isPlayer ? heaveHoRank * 2 : 0);
  return Math.min(weaponRange, st * 3);
}

/**
 * Quick Recovery (perk 102, 0x425fd8, w 0x425fbc): koszt AP wstania z powalenia = 3, dla gracza
 * z perkiem 1. Gdy koszt > AP, AP spada do 0, inaczej AP -= koszt.
 */
export function standUpApCost(isPlayer: boolean, quickRecoveryRank: number): number {
  return isPlayer && quickRecoveryRank > 0 ? 1 : 3;
}

export function standUp(ap: number, isPlayer: boolean, quickRecoveryRank: number): number {
  const cost = standUpApCost(isPlayer, quickRecoveryRank);
  return cost > ap ? 0 : ap - cost;
}

/**
 * Night Vision (perk 9, 0x47a908, D): swiatlo otoczenia gracza = clamp(swiatlo + ranga * 0x3333,
 * 0x4000, 0x10000). 0x3333 = 13107, czyli okolo 20 procent skali 0x10000 na rang.
 */
export function nightVisionLight(light: number, rank: number): number {
  return Math.min(0x10000, Math.max(0x4000, light + rank * 0x3333));
}

/** Kod perku broni (proto+0x50) Enhanced Knockout (= id perku 117). */
export const WEAPON_PERK_ENHANCED_KNOCKOUT = 0x75;

/**
 * Enhanced Knockout (perk broni 0x75, 0x423714, D): przy trafieniu rand(1,100) <= ST atakujacego - 8
 * ustawia flage +0x30 bit 0 rekordu ataku (efekt powalenia/ogluszenia; samo znaczenie flagi
 * to criticals.md U1, Z). Trafienie krytyczne ustawia te flage zawsze (0x423eb4). Losowanie
 * tylko gdy bron ma ten perk.
 */
export function enhancedKnockoutFlag(
  weaponPerk: number | undefined,
  attackerStrength: number,
  critical: boolean,
  rng: { int(min: number, max: number): number },
): boolean {
  if (weaponPerk !== WEAPON_PERK_ENHANCED_KNOCKOUT) return false;
  if (critical) return true;
  return rng.int(1, 100) <= attackerStrength - 8;
}
