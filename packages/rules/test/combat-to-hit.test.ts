import { describe, expect, it } from 'vitest';
import { BodyPart, BODY_PART_TO_HIT, TO_HIT_MAX, finishToHit } from '../src/index.js';

const base = { skillAfterDistance: 0, part: BodyPart.Torso };

describe('toHit, czesc D (0x4243a8)', () => {
  it('tabela czesci ciala', () => {
    expect([...BODY_PART_TO_HIT]).toEqual([-40, -30, -30, 0, -20, -20, -60, -30, 0, 4]);
    expect(TO_HIT_MAX).toBe(95);
  });
  it('120 tors stoi -> 95 (przyciecie)', () => {
    expect(finishToHit({ ...base, skillAfterDistance: 120 })).toBe(95);
  });
  it('60 oczy stoi -> 0', () => {
    expect(finishToHit({ ...base, skillAfterDistance: 60, part: BodyPart.Eyes })).toBe(0);
  });
  it('50 glowa lezacy -> 50-40+40 = 50', () => {
    expect(
      finishToHit({ ...base, skillAfterDistance: 50, part: BodyPart.Head, targetProne: true }),
    ).toBe(50);
  });
  it('70 tors, NPC trudny (-20) -> 50', () => {
    expect(finishToHit({ ...base, skillAfterDistance: 70, difficultyMod: -20 })).toBe(50);
  });
  it('uszkodzone oczy atakujacego -25, flaga +15, kara swiatla', () => {
    expect(finishToHit({ ...base, skillAfterDistance: 80, attackerEyesCrippled: true })).toBe(55);
    expect(finishToHit({ ...base, skillAfterDistance: 40, flag15: true })).toBe(55);
    expect(finishToHit({ ...base, skillAfterDistance: 80, lightPenalty: -10 })).toBe(70);
  });
  it('wynik ujemny zostaje ujemny (D: 0x424791 przycina tylko gore do 95)', () => {
    expect(finishToHit({ ...base, skillAfterDistance: 10, part: BodyPart.Eyes })).toBe(-50);
  });
});
