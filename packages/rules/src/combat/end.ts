/** Warunek konca walki (0x422c60, specyfikacja formatu R13e, D). Pole +0x54 = kto go trafil (wniosek z uzycia). */
export interface CombatParticipant {
  team: number;
  /** Druzyna obiektu z pola +0x54 uczestnika, undefined gdy null. */
  whoHitMeTeam?: number | undefined;
}

export interface CombatEndInput {
  playerPresent: boolean;
  playerTeam: number;
  participants: readonly CombatParticipant[];
}

export function combatShouldEnd(i: CombatEndInput): boolean {
  if (i.participants.length < 2) return true;
  if (!i.playerPresent) return true;
  for (const p of i.participants) {
    if (p.team !== i.playerTeam) return false;
    if (p.whoHitMeTeam !== undefined && p.whoHitMeTeam === i.playerTeam) return false;
  }
  return true;
}

/** Uczestnik dla recznego konczenia walki (0x422694). */
export interface ManualEndCandidate extends CombatParticipant {
  isPlayer?: boolean;
  /** Lista aktywna: 0x42b4a8 == 0 (zagrozenie: nie flaga +0x3c&2/&4, zywy, w zasiegu 0x42ba04). Lista oczekujaca: 0x42b3fc != 0. */
  threat: boolean;
}

/**
 * Reczne zakonczenie walki przez gracza (0x422694, D, specyfikacja formatu 2026-11-13; jedyne uzycie komunikatu 103
 * combat.msg: "Combat cannot end with nearby hostile creatures."). Tylko w turze gracza (0x56d378 ==
 * gracz+0x28); w innym przypadku (0x4227c6) walka konczy sie bez sprawdzania. Przechodzi liste
 * aktywna, potem liste oczekujaca (ten sam filtr druzyny co 0x422c60: obca druzyna lub wlasna druzyna
 * z celem +0x54 z wlasnej druzyny); pierwszy kandydat z `threat` blokuje koniec i daje komunikat 103.
 */
export function manualEndCombatBlocked(
  playerTeam: number,
  playersTurn: boolean,
  active: readonly ManualEndCandidate[],
  pending: readonly ManualEndCandidate[],
): boolean {
  if (!playersTurn) return false;
  const relevant = (c: ManualEndCandidate): boolean =>
    c.isPlayer !== true &&
    (c.team !== playerTeam || (c.whoHitMeTeam !== undefined && c.whoHitMeTeam === c.team));
  return [...active, ...pending].some((c) => relevant(c) && c.threat);
}

export const COMBAT_MSG_CANNOT_END = 103;

/** proto.msg: 621 "%s you earn %d exp. points." (0x26d); 622..625 przedrostki, 626 "bez zadraśnięcia". */
export const COMBAT_XP_MSG_BASE = 621;
export const COMBAT_XP_MSG_UNSCRATCHED = 626;

/**
 * Tekst XP po walce (0x4221b4, D, specyfikacja formatu 2026-11-13): przy xp > 0 i graczu niezajetym (0x42dd18 == 0) XP dodaje
 * 0x4afaa8 (Swift Learner tam). Przedrostek = msg 622 + rand(0..3); gdy HP == maxHP (stat 0x23 == stat 7) i
 * rand(0..100) > 0x41 (65), msg 626. Wynik: id wiadomosci przedrostka i zlozenie "<przedrostek><621 z %d>".
 */
export function combatXpPrefixMsg(
  hp: number,
  maxHp: number,
  rng: { int(min: number, max: number): number },
): number {
  let id = 622 + rng.int(0, 3);
  if (hp === maxHp && rng.int(0, 100) > 0x41) id = COMBAT_XP_MSG_UNSCRATCHED;
  return id;
}
