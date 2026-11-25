import { describe, expect, it } from 'vitest';
import {
  Perk,
  RollResult,
  dialogIntelligence,
  expForLevel,
  hereAndNowGrant,
  newCritterData,
  stealAttempt,
  stealModifier,
  stealThiefChance,
  targetSeesThiefByRotation,
  type Rng,
  type StealParams,
} from '../src/index.js';

function seq(values: number[]): Rng {
  let i = 0;
  return { int: (min) => values[i++] ?? min };
}

const base: StealParams = {
  thiefSkill: 60,
  thiefCriticalChance: 0,
  thiefIsPlayerWithPickpocket: false,
  thiefIsPlayer: true,
  itemSize: 2,
  transferredCount: 0,
  targetIsCritter: true,
  targetSeesThief: true,
  targetDowned: false,
  targetSkill: 40,
  targetInPlayerParty: false,
};

describe('Steal 0x4abbe4 (Pickpocket 37)', () => {
  it('modyfikator: 1 - liczba, -4*rozmiar, -25 gdy cel widzi, +20 gdy powalony', () => {
    expect(stealModifier(base)).toBe(1 - 8 - 25);
    expect(stealModifier({ ...base, transferredCount: 2 })).toBe(-1 - 8 - 25);
    expect(stealModifier({ ...base, targetDowned: true })).toBe(1 - 8 - 25 + 20);
    expect(stealModifier({ ...base, targetSeesThief: false })).toBe(1 - 8);
    expect(stealModifier({ ...base, targetIsCritter: false })).toBe(1 - 8);
  });

  it('Pickpocket pomija kary rozmiaru i widocznosci, ale nie bonus za powalenie', () => {
    const p = { ...base, thiefIsPlayerWithPickpocket: true };
    expect(stealModifier(p)).toBe(1);
    expect(stealModifier({ ...p, targetDowned: true })).toBe(21);
    expect(stealModifier({ ...p, transferredCount: 3 })).toBe(-2);
  });

  it('szansa zlodzieja ma limit 95', () => {
    expect(stealThiefChance({ ...base, thiefSkill: 200, thiefIsPlayerWithPickpocket: true })).toBe(
      95,
    );
  });

  it('rotacja: za plecami (roznica 0, 1, 5) cel nie widzi', () => {
    expect(targetSeesThiefByRotation(2, 2)).toBe(false);
    expect(targetSeesThiefByRotation(2, 3)).toBe(false);
    expect(targetSeesThiefByRotation(2, 1)).toBe(false);
    expect(targetSeesThiefByRotation(2, 5)).toBe(true);
    expect(targetSeesThiefByRotation(0, 3)).toBe(true);
  });

  it('druzyna gracza: zawsze sukces bez rzutow', () => {
    const o = stealAttempt({ ...base, targetInPlayerParty: true }, seq([]), false);
    expect(o.caught).toBe(false);
    expect(o.thiefRoll).toBe(RollResult.CriticalSuccess);
    expect(o.observerRoll).toBeNull();
  });

  it('krytyczna porazka zlodzieja = przylapany, bez drugiego rzutu', () => {
    // szansa 60-32=28; rzut 90 -> porazka, krytyk: rzut 1 <= (62/10=6) -> krytyczna porazka
    const o = stealAttempt(base, seq([90, 1]));
    expect(o.thiefRoll).toBe(RollResult.CriticalFailure);
    expect(o.caught).toBe(true);
    expect(o.observerRoll).toBeNull();
  });

  it('krytyczny sukces zlodzieja = udane bez drugiego rzutu', () => {
    const o = stealAttempt(
      { ...base, thiefCriticalChance: 100, thiefIsPlayerWithPickpocket: true },
      seq([1, 1]),
    );
    expect(o.thiefRoll).toBe(RollResult.CriticalSuccess);
    expect(o.caught).toBe(false);
  });

  it('zwykly wynik zlodzieja idzie do rzutu obserwatora (skill celu - m)', () => {
    // krytyki wylaczone: zlodziej 28 vs rzut 20 = sukces; obserwator 40-(-32)=72, rzut 10 = sukces = przylapany
    const caught = stealAttempt(base, seq([20, 10]), false);
    expect(caught.thiefRoll).toBe(RollResult.Success);
    expect(caught.observerRoll).toBe(RollResult.Success);
    expect(caught.caught).toBe(true);
    // rzut obserwatora 99 > 72 = porazka = udane
    const clean = stealAttempt(base, seq([20, 99]), false);
    expect(clean.observerRoll).toBe(RollResult.Failure);
    expect(clean.caught).toBe(false);
  });

  it('cel nie-krytter: szansa obserwatora 30 - m', () => {
    // m = 1-8 = -7 -> 37; rzut 40 = porazka => nie przylapany
    const o = stealAttempt({ ...base, targetIsCritter: false }, seq([10, 40]), false);
    expect(o.observerRoll).toBe(RollResult.Failure);
    expect(o.caught).toBe(false);
  });
});

describe('Here and Now 92, Smooth Talker 49', () => {
  it('Here and Now daje XP brakujace do nastepnego poziomu', () => {
    expect(hereAndNowGrant({ level: 5, xp: expForLevel(5) + 100 })).toBe(
      expForLevel(6) - expForLevel(5) - 100,
    );
  });

  it('Smooth Talker dodaje range do IN dialogowego', () => {
    const c = newCritterData(true);
    expect(dialogIntelligence(c, 4)).toBe(4);
    c.perkRanks[Perk.SmoothTalker] = 3;
    expect(dialogIntelligence(c, 4)).toBe(7);
  });
});
