/**
 * AP (0x4222a8, 0x422914, 0x42299c; D): na poczatku rundy AP = stat 8 (max AP); gdy istnieje
 * dodatkowy rekord druzyny (DAT_0051094c != 0), dodaje sie jego pole +8.
 * TODO(combat.md U3): semantyka rekordu 0x51094c nieznana (Z), dlatego to jawny parametr.
 * Koszt ataku i ruchu: attackApCost i moveStepCost nizej (D).
 */
export function apAtTurnStart(maxAp: number, partyRecordBonus = 0): number {
  return maxAp + partyRecordBonus;
}

/**
 * Darmowe punkty ruchu gracza na poczatku tury (0x42299c): `perkLevel(0x496b78) * 2` (D).
 * TODO(combat.md): ktory to perk (0x496b78 = funkcja poziomu perku, id perku nie ustalony w specyfikacji).
 */
export function freeMoveAp(perkLevel: number): number {
  return perkLevel * 2;
}

/**
 * Perk darmowych punktow ruchu: `perkLevel(player, 3)` = Bonus Move (D, specyfikacja formatu 0x4229f0..0x4229ff:
 * edx=3 zachowany przez 0x45eda8 trafia do 0x496b78). Punkty zerowane na koncu tury (0x422b59, 0x422c51).
 */
export const FREE_MOVE_PERK = 3;

/**
 * Pobranie kosztu ruchu w walce (0x417665..0x417699, D): najpierw darmowe punkty (0x56d39c), reszta z AP,
 * AP nie spada ponizej 0.
 */
export function spendMoveAp(free: number, ap: number, cost: number): { free: number; ap: number } {
  if (free >= cost) return { free: free - cost, ap };
  const rest = cost - free;
  return { free: 0, ap: rest > ap ? 0 : ap - rest };
}

export interface AttackApInput {
  /** Tryb ataku 0..0x13 (0x478b24). */
  mode: number;
  /** Czy w rece jest bron (proto istnieje); false = walka bez broni. */
  hasWeapon: boolean;
  /** Koszt z proto: +0x44 (tryb 0 i 2) albo +0x48 = data[9] (tryby 1 i 3, drugi tryb), D. */
  protoPrimaryAp?: number;
  protoSecondaryAp?: number;
  /** Atakujacy to gracz (perki i Fast Shot dzialaja tylko dla niego). */
  isPlayer?: boolean;
  /** Cecha 7 (Fast Shot, 0x4b3bc8) gracza i zasieg broni w trybie (0x478a1c). */
  fastShot?: boolean;
  weaponRange?: number;
  /** Klasa broni w trybie (0x478280): 1 piesc, 2 melee, 4 dystans. */
  weaponClass?: number;
  /** Poziom perka 1 (HtH) i perka 5 (Rate of Fire), 0x496b78. */
  perk1?: number;
  perk5?: number;
  aimed?: boolean;
  /** Tryby 6/7 (przeladowanie, 0x478b5e): pole proto broni +0x50 (0x41 -> koszt 1) i pid broni (0x186 -> koszt 0). */
  weaponPerk?: number;
  weaponPid?: number;
}

/** Koszt AP trybu ataku, item_w_ap_cost 0x478b24 (D, wg asemblera). Minimum 1. */
export function attackApCost(i: AttackApInput): number {
  const m = i.mode;
  if (m === 6 || m === 7) {
    // 0x478b5e..0x478b9f: zwrot od razu, bez modyfikatorow gracza i bez minimum 1. Brak broni to w oryginale
    // odczyt [0+0x64] (Z, nieosiagalne w praktyce), tu 2.
    if (i.hasWeapon && i.weaponPerk === 0x41) return 1;
    if (i.hasWeapon && i.weaponPid === 0x186) return 0;
    return 2;
  }
  let c: number;
  const fixed: Record<number, number> = {
    0xe: 4,
    0xf: 4,
    0x10: 4,
    0xb: 3,
    0xc: 6,
    0x11: 7,
    0x12: 7,
    0xd: 8,
    0x13: 9,
  };
  if (fixed[m] !== undefined) c = fixed[m] as number;
  else if (!i.hasWeapon || [4, 5, 8, 9, 10].includes(m)) c = 3;
  else {
    c = (m === 0 || m === 2 ? i.protoPrimaryAp : i.protoSecondaryAp) ?? 3;
    if (i.isPlayer && i.fastShot && (i.weaponRange ?? 0) > 2) c -= 1;
  }
  if (i.isPlayer) {
    const k = i.weaponClass;
    if ((i.perk1 ?? 0) > 0 && (k === 1 || k === 2)) c -= 1;
    if ((i.perk5 ?? 0) > 0 && k === 4) c -= 1;
  }
  if (i.aimed) c += 1;
  return Math.max(1, c);
}

/**
 * Koszt ruchu 0x42e62c (D): tylko kryter (typ pid 1). Flagi nog `+0x44`: obie (0x4 i 0x8) = 8 AP/heks,
 * jedna z nich = 4 AP/heks, brak = 1.
 */
export function moveStepCost(isCritter: boolean, legFlags: number, hexes: number): number {
  if (!isCritter) return 0;
  if ((legFlags & 0x4) !== 0 && (legFlags & 0x8) !== 0) return 8 * hexes;
  if ((legFlags & 0xc) !== 0) return 4 * hexes;
  return hexes;
}
