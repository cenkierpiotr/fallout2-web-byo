import { RollResult, rollCheck } from './roll.js';
import type { Rng } from './types.js';

/**
 * Kradziez (Steal) wg funkcji silnikowej 0x4abbe4 (wolana z okna kradziezy 0x4749a2 przy wkladaniu i
 * 0x474a69 przy braniu przedmiotu; tryb kradziezy ustawia 0x4746a0 gdy cel jest krytterem). Poziom D.
 *
 * Modyfikator m:
 *  - start: 1 - liczba przedmiotow juz przeniesionych w tej sesji ([0x51d434]);
 *  - jesli NIE (zlodziej to gracz z perkiem Pickpocket 0x25): m -= 4 * rozmiar przedmiotu (proto +0x70),
 *    a gdy cel jest krytterem i nie stoi zwrocony tylem do zlodzieja (0x412bc4 == 1): m -= 25;
 *  - cel powalony lub nieprzytomny (flagi obrazen & 3): m += 20.
 * Szansa zlodzieja = skill Steal + m, max 95. Gracz kradnie druzynie bez ryzyka (rzut = krytyczny sukces).
 * Pierwszy rzut (0x4a3000, krytyk zlodzieja): krytyczny sukces = udane, krytyczna porazka = przylapany,
 * inaczej drugi rzut obserwatora (bez modyfikatora krytyka): szansa = skill Steal celu - m (krytter) albo
 * 30 - m (nie-krytter); sukces lub krytyczny sukces obserwatora = przylapany.
 */
export const STEAL_PARAMS = {
  chanceCap: 95,
  sizePenaltyPerUnit: 4,
  spottedPenalty: 25,
  downedBonus: 20,
  nonCritterObserverBase: 30,
} as const;

export interface StealParams {
  /** Skill Steal zlodzieja (z bonusami). */
  thiefSkill: number;
  /** Statystyka szansy krytycznej zlodzieja (stat 15). */
  thiefCriticalChance: number;
  /** Zlodziej to gracz z perkiem Pickpocket: pomija kary za rozmiar i widocznosc. */
  thiefIsPlayerWithPickpocket: boolean;
  /** Zlodziej to gracz (kradziez druzynie jest bezpieczna). */
  thiefIsPlayer: boolean;
  /** Rozmiar przenoszonego przedmiotu (proto +0x70). */
  itemSize: number;
  /** Liczba przedmiotow juz przeniesionych w tej sesji kradziezy. */
  transferredCount: number;
  targetIsCritter: boolean;
  /** Cel widzi zlodzieja (0x412bc4 == 1: rotacja celu wzgledem zlodzieja nie jest 0, 1 ani 5). */
  targetSeesThief: boolean;
  /** Cel powalony lub nieprzytomny. */
  targetDowned: boolean;
  /** Skill Steal celu (tylko krytter). */
  targetSkill: number;
  /** Cel jest w druzynie gracza (0x494fc4). */
  targetInPlayerParty: boolean;
}

export interface StealOutcome {
  caught: boolean;
  modifier: number;
  chance: number;
  thiefRoll: RollResult | null;
  observerRoll: RollResult | null;
}

/** Rotacje (0..5) zwrocone tylem: roznica 0, 1 lub 5 = zlodziej za plecami celu (0x412bc4 zwraca 0). */
export function targetSeesThiefByRotation(thiefRotation: number, targetRotation: number): boolean {
  const d = (((targetRotation - thiefRotation) % 6) + 6) % 6;
  return !(d === 0 || d === 1 || d === 5);
}

export function stealModifier(p: StealParams): number {
  let m = 1 - p.transferredCount;
  if (!p.thiefIsPlayerWithPickpocket) {
    m -= STEAL_PARAMS.sizePenaltyPerUnit * p.itemSize;
    if (p.targetIsCritter && p.targetSeesThief) m -= STEAL_PARAMS.spottedPenalty;
  }
  if (p.targetDowned) m += STEAL_PARAMS.downedBonus;
  return m;
}

/** Szansa zlodzieja (0..95) pokazywana i uzywana w pierwszym rzucie. */
export function stealThiefChance(p: StealParams): number {
  return Math.min(STEAL_PARAMS.chanceCap, p.thiefSkill + stealModifier(p));
}

export function stealAttempt(p: StealParams, rng: Rng, critsEnabled = true): StealOutcome {
  const modifier = stealModifier(p);
  const chance = stealThiefChance(p);
  let thiefRoll: RollResult | null = null;
  let observerRoll: RollResult | null = null;
  let caught: boolean;
  if (p.thiefIsPlayer && p.targetInPlayerParty) {
    thiefRoll = RollResult.CriticalSuccess;
    caught = false;
  } else {
    thiefRoll = rollCheck(chance, p.thiefCriticalChance, rng, critsEnabled);
    if (thiefRoll === RollResult.CriticalSuccess) caught = false;
    else if (thiefRoll === RollResult.CriticalFailure) caught = true;
    else {
      const observerChance =
        (p.targetIsCritter ? p.targetSkill : STEAL_PARAMS.nonCritterObserverBase) - modifier;
      observerRoll = rollCheck(observerChance, 0, rng, critsEnabled);
      caught = observerRoll === RollResult.Success || observerRoll === RollResult.CriticalSuccess;
    }
  }
  return { caught, modifier, chance, thiefRoll, observerRoll };
}
