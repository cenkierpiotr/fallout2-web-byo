import { RollResult } from './roll.js';
import { Perk } from './perks.js';
import { Trait } from './traits.js';
import type { CritterData, Rng } from './types.js';

function hasTraitSlot(c: CritterData, t: Trait): boolean {
  return c.traits.includes(t);
}

/**
 * Bloody Mess (trait 8, R11c-U1): has_trait 0x4b3bc8 w 0x410707 wewnatrz doboru animacji smierci
 * 0x41060c. Flaga jest ustawiana tylko gdy atakujacy to gracz z tym traitem.
 */
export function bloodyMessActive(attacker: CritterData | undefined): boolean {
  return attacker?.isPlayer === true && hasTraitSlot(attacker, Trait.BloodyMess);
}

export interface DeathAnimations {
  /** Animacja wybrana normalnie (wg progu obrazen). */
  normal: number;
  /** Najbardziej brutalna animacja (np. 0x17 zamiast 0x14/0x15). */
  brutal: number;
}

/**
 * Wybor animacji smierci. Z Bloody Mess pomijane sa porownania progu obrazen i wybierana jest
 * najbardziej brutalna animacja; brak wplywu na obrazenia.
 *
 * TODO(R11c-U1): spec nie podaje tabeli progow obrazen ani zestawu animacji per bron/typ obrazen
 * (0x41060c); wywolujacy dostarcza `normal` i `brutal`. Mapowanie bron/obrazenia -> animacja do
 * uzupelnienia po dekompilacji 0x41060c.
 */
export function selectDeathAnimation(
  attacker: CritterData | undefined,
  anims: DeathAnimations,
): number {
  return bloodyMessActive(attacker) ? anims.brutal : anims.normal;
}

/**
 * Jinxed (trait 9 lub perk 118 gracza, R11c-U2): w funkcji rzutu ataku (0x423850..0x4238cd), gdy wynik
 * rzutu == 1 (zwykla porazka), rand(0,1) (0x4a30c0) niezerowe (50%) zamienia go na 0 (krytyczna
 * porazka). `player` to gracz (has_trait czyta tylko jego sloty), ale efekt dotyczy rzutow WSZYSTKICH
 * atakujacych. Zuzywa rzut tylko przy zwyklej porazce.
 */
export function applyJinxed(
  result: RollResult,
  player: CritterData | undefined,
  rng: Rng,
): RollResult {
  if (result !== RollResult.Failure || !player) return result;
  const jinxed = hasTraitSlot(player, Trait.Jinxed) || (player.perkRanks[Perk.Jinxed] ?? 0) > 0;
  if (!jinxed) return result;
  return rng.int(0, 1) !== 0 ? RollResult.CriticalFailure : result;
}

/** Klasa ataku (0x478280): 1 piesc, 2 bron biala, 3 rzut, 4 dystans. */
export type AttackClass = 1 | 2 | 3 | 4;

export interface AttackRollPerkInput {
  /** Klasa ataku z 0x478280 (edi w 0x42378c). */
  attackClass: AttackClass;
  /** Atakujacy jest graczem (rekord[0] == 0x6610b8); perki dzialaja tylko dla niego. */
  attackerIsPlayer: boolean;
  /** Ranga perka 23 (Slayer) i 24 (Sniper) gracza. */
  slayer: number;
  sniper: number;
  /** Wartosc statu 6 (Luck) gracza, 0x4aef48. */
  luck: number;
}

/**
 * Slayer i Sniper w rzucie ataku (0x42378c, D): dotyczy tylko wyniku 2 (zwykly sukces) atakujacego
 * gracza. Klasa 1 lub 2 (HtH) z perkiem 23 (0x4238f9) daje 3 (krytyczny sukces) bez losowania.
 * Klasa 4 (dystans) z perkiem 24 (0x423a2f): rand(1,10) (0x4a30c0) <= Luck (stat 6) daje 3;
 * losowanie zuzywane tylko gdy perk jest obecny. Rzut (klasa 3) nie jest dotkniety.
 */
export function applyAttackRollPerks(
  result: RollResult,
  i: AttackRollPerkInput,
  rng: Rng,
): RollResult {
  if (result !== RollResult.Success || !i.attackerIsPlayer) return result;
  if ((i.attackClass === 1 || i.attackClass === 2) && i.slayer > 0)
    return RollResult.CriticalSuccess;
  if (i.attackClass === 4 && i.sniper > 0) {
    return rng.int(1, 10) <= i.luck ? RollResult.CriticalSuccess : result;
  }
  return result;
}

/**
 * Funkcja 0x412bc4(a, b) == 0 wtedy i tylko wtedy, gdy roznica obrotow (0..5) to 0, 1 lub 5,
 * czyli atakujacy stoi za plecami celu (D, specyfikacja formatu).
 */
export function isBehind(rotA: number, rotB: number): boolean {
  const d = Math.abs(rotA - rotB);
  return d === 0 || d === 1 || d === 5;
}

export interface SilentDeathInput {
  /** Wynik rzutu przed Slayerem (warunek: 2, zwykly sukces). */
  result: RollResult;
  attackClass: AttackClass;
  attackerIsPlayer: boolean;
  /** Ranga perka 25 (Silent Death). */
  silentDeath: number;
  /** 0x412bc4(gracz, cel) == 0: atak od tylu. */
  behind: boolean;
  /** Skradanie aktywne: bit 0 flag +0x20 protokolu gracza (0x42e2f8). */
  sneaking: boolean;
  /** Cel ostatnio trafiony przez gracza (cel+0x54 == gracz): wtedy bez efektu. */
  targetLastHitByPlayer: boolean;
}

/**
 * Silent Death (perk 25, 0x423911, D): tylko HtH (klasa 1 lub 2), zwykly sukces, atakujacy gracz,
 * atak od tylu w skradaniu, cel nie jest tym, ktory ostatnio trafil gracz. Wynik: mnoznik obrazen
 * (lokalna rec 0x20 wpisana 4 zamiast domyslnego 2) = 4. Zwraca 4 albo undefined.
 */
export function silentDeathMultiplier(i: SilentDeathInput): number | undefined {
  if (i.result !== RollResult.Success || !i.attackerIsPlayer) return undefined;
  if (i.attackClass !== 1 && i.attackClass !== 2) return undefined;
  if (i.silentDeath <= 0 || !i.behind || !i.sneaking || i.targetLastHitByPlayer) return undefined;
  return 4;
}
