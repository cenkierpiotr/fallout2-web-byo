import { describe, expect, it } from 'vitest';
import {
  BodyPart,
  CRITICAL_BETTER_CRITICALS_BONUS,
  FREE_MOVE_PERK,
  criticalLevel,
  determineToHit,
  lightToHitPenalty,
  spendMoveAp,
} from '../src/index.js';

describe('determineToHit: przyklady z dokumentacja techniczna (formula 0x4243a8)', () => {
  const r = { ranged: true as const };
  it('120 tors -> 95', () => {
    expect(determineToHit({ skill: 120, part: BodyPart.Torso, ...r })).toBe(95);
  });
  it('60 oczy -> 0', () => {
    expect(determineToHit({ skill: 60, part: BodyPart.Eyes, ...r })).toBe(0);
  });
  it('50 czesc 0 cel lezy -> 50', () => {
    expect(determineToHit({ skill: 50, part: BodyPart.Head, targetProne: true, ...r })).toBe(50);
  });
  it('70 tors NPC latwy (-20) -> 50', () => {
    expect(determineToHit({ skill: 70, part: BodyPart.Torso, difficultyMod: -20, ...r })).toBe(50);
  });
  it('80 czesc 0 melee (polowa -20) -> 60', () => {
    expect(determineToHit({ skill: 80, part: BodyPart.Head, ranged: false })).toBe(60);
  });
  it('90 czesc 4 AC 30 -> 40', () => {
    expect(determineToHit({ skill: 90, part: BodyPart.RightLeg, targetAc: 30, ...r })).toBe(40);
  });
  it('75 tors minST 7 ST 5 -> 35', () => {
    expect(determineToHit({ skill: 75, part: BodyPart.Torso, minSt: 7, st: 5, ...r })).toBe(35);
  });
  it('Weapon Handling zmniejsza wymagane ST o 3 (gracz)', () => {
    expect(
      determineToHit({
        skill: 75,
        part: BodyPart.Torso,
        minSt: 7,
        st: 5,
        isPlayer: true,
        weaponHandling: true,
        ...r,
      }),
    ).toBe(75);
  });
  it('60 tors Accurate (+20) swiatlo -25 -> 55', () => {
    expect(
      determineToHit({
        skill: 60,
        part: BodyPart.Torso,
        accurate: true,
        lightPenalty: lightToHitPenalty(0x9000),
        ...r,
      }),
    ).toBe(55);
  });
  it('50 czesc 9 multihex +15 trudny +20 -> 89', () => {
    expect(
      determineToHit({
        skill: 50,
        part: 9 as BodyPart,
        targetMultihex: true,
        difficultyMod: 20,
        ...r,
      }),
    ).toBe(89);
  });
  it('70 tors 2 krytery na linii (-20) uszkodzone oczy (-25) -> 25', () => {
    expect(
      determineToHit({
        skill: 70,
        part: BodyPart.Torso,
        coverCount: 2,
        attackerEyesCrippled: true,
        ...r,
      }),
    ).toBe(25);
  });
  it('One Hander: bron dwureczna -40, jednoreczna +20 (gracz, tryby 0..3)', () => {
    const b = { skill: 50, part: BodyPart.Torso, isPlayer: true, oneHander: true, ...r };
    expect(determineToHit({ ...b, twoHanded: true })).toBe(10);
    expect(determineToHit({ ...b, twoHanded: false })).toBe(70);
  });
  it('kara AC amunicji, AC nie spada ponizej 0', () => {
    expect(
      determineToHit({ skill: 50, part: BodyPart.Torso, targetAc: 10, ammoAcMod: -4, ...r }),
    ).toBe(44);
    expect(
      determineToHit({ skill: 50, part: BodyPart.Torso, targetAc: 3, ammoAcMod: -10, ...r }),
    ).toBe(50);
  });
});

describe('kara swiatla (krok 11, progi 0x6666/0x9999/0xcccc)', () => {
  it('progi', () => {
    expect(lightToHitPenalty(0x6666)).toBe(-40);
    expect(lightToHitPenalty(0x9999)).toBe(-25);
    expect(lightToHitPenalty(0xcccc)).toBe(-10);
    expect(lightToHitPenalty(0xcccd)).toBe(0);
  });
});

describe('ruch: darmowe punkty (0x417665..0x417699, D)', () => {
  it('Bonus Move = perk 3', () => expect(FREE_MOVE_PERK).toBe(3));
  it('darmowe zuzywane pierwsze', () => {
    expect(spendMoveAp(4, 6, 3)).toEqual({ free: 1, ap: 6 });
  });
  it('nadwyzka z AP', () => {
    expect(spendMoveAp(2, 6, 5)).toEqual({ free: 0, ap: 3 });
  });
  it('AP nie spada ponizej 0', () => {
    expect(spendMoveAp(0, 2, 5)).toEqual({ free: 0, ap: 0 });
  });
});

describe('Better Criticals: bonus to wartosc statu 16 (+20 z perka)', () => {
  it('perk daje +20', () => expect(CRITICAL_BETTER_CRITICALS_BONUS).toBe(20));
  it('roll 30 + 20 -> poziom 2', () => expect(criticalLevel(30, 20)).toBe(2));
  it('roll 25 + 20 = 45 -> poziom 1 (granica), 26 -> 2', () => {
    expect(criticalLevel(25, 20)).toBe(1);
    expect(criticalLevel(26, 20)).toBe(2);
  });
});
