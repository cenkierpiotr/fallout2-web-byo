import { describe, expect, it } from 'vitest';
import {
  RollResult,
  applyAttackRollPerks,
  isBehind,
  silentDeathMultiplier,
  rangedBonusDamage,
  stonewallKnockback,
  computeRoundDamage,
  knockbackDamage,
  throwRange,
  standUp,
  standUpApCost,
  nightVisionLight,
  attackApCost,
  freeMoveAp,
  totalDamage,
  DamageType,
  enhancedKnockoutFlag,
} from '../src/index.js';

const rngOf = (v: number) => ({ int: () => v });
const base = { attackerIsPlayer: true, slayer: 0, sniper: 0, luck: 5 };

describe('Slayer i Sniper (0x42378c, D)', () => {
  it('Slayer: HtH zwykly sukces -> krytyczny, tylko gracz', () => {
    expect(
      applyAttackRollPerks(RollResult.Success, { ...base, attackClass: 1, slayer: 1 }, rngOf(10)),
    ).toBe(RollResult.CriticalSuccess);
    expect(
      applyAttackRollPerks(RollResult.Success, { ...base, attackClass: 2, slayer: 1 }, rngOf(10)),
    ).toBe(RollResult.CriticalSuccess);
    expect(
      applyAttackRollPerks(
        RollResult.Success,
        { ...base, attackerIsPlayer: false, attackClass: 1, slayer: 1 },
        rngOf(1),
      ),
    ).toBe(RollResult.Success);
    expect(
      applyAttackRollPerks(RollResult.Success, { ...base, attackClass: 4, slayer: 1 }, rngOf(1)),
    ).toBe(RollResult.Success);
    expect(
      applyAttackRollPerks(RollResult.Failure, { ...base, attackClass: 1, slayer: 1 }, rngOf(1)),
    ).toBe(RollResult.Failure);
  });
  it('Sniper: dystans, rand(1,10) <= Luck daje krytyczny', () => {
    const i = { ...base, attackClass: 4 as const, sniper: 1, luck: 6 };
    expect(applyAttackRollPerks(RollResult.Success, i, rngOf(6))).toBe(RollResult.CriticalSuccess);
    expect(applyAttackRollPerks(RollResult.Success, i, rngOf(7))).toBe(RollResult.Success);
    expect(applyAttackRollPerks(RollResult.Success, { ...i, attackClass: 3 }, rngOf(1))).toBe(
      RollResult.Success,
    );
  });
});

describe('Silent Death (0x423911, D)', () => {
  const i = {
    result: RollResult.Success,
    attackClass: 1 as const,
    attackerIsPlayer: true,
    silentDeath: 1,
    behind: true,
    sneaking: true,
    targetLastHitByPlayer: false,
  };
  it('mnoznik 4 przy ataku od tylu w skradaniu', () => {
    expect(silentDeathMultiplier(i)).toBe(4);
  });
  it.each([
    { behind: false },
    { sneaking: false },
    { targetLastHitByPlayer: true },
    { silentDeath: 0 },
    { attackClass: 4 as const },
    { result: RollResult.Failure },
  ])('bez efektu: %o', (o) => {
    expect(silentDeathMultiplier({ ...i, ...o })).toBeUndefined();
  });
  it('isBehind: roznice 0,1,5 to plecy', () => {
    expect(isBehind(3, 3)).toBe(true);
    expect(isBehind(3, 4)).toBe(true);
    expect(isBehind(0, 5)).toBe(true);
    expect(isBehind(0, 3)).toBe(false);
  });
});

describe('Bonus Ranged Damage (0x42492b, D)', () => {
  it('2 * ranga tylko dla gracza z klasa 4', () => {
    expect(rangedBonusDamage(2, true, 4)).toBe(4);
    expect(rangedBonusDamage(2, true, 3)).toBe(0);
    expect(rangedBonusDamage(2, false, 4)).toBe(0);
  });
  it('bonus dodawany do rzutu przed mnoznikiem', () => {
    const r = (roll: number) =>
      computeRoundDamage({
        roll,
        rangedBonus: 0,
        ammoMult: 1,
        ammoDiv: 1,
        difficulty: 100,
        dt: 0,
        dr: 0,
      });
    expect(r((10 + rangedBonusDamage(1, true, 4)) * 2)).toBe(12);
  });
});

describe('Stonewall (0x424b37, D)', () => {
  it('rand<50 anuluje, inaczej polowa; tylko gdy cel to gracz z perkiem', () => {
    expect(stonewallKnockback(9, true, 1, () => 49)).toBe(0);
    expect(stonewallKnockback(9, true, 1, () => 50)).toBe(4);
    expect(stonewallKnockback(9, false, 1, () => 0)).toBe(9);
    expect(stonewallKnockback(9, true, 0, () => 0)).toBe(9);
    expect(knockbackDamage(90, false)).toBe(9);
  });
});

describe('Heave Ho, Quick Recovery, Night Vision (D)', () => {
  it('Heave Ho: min(zasieg broni, 3*(ST+2*ranga))', () => {
    expect(throwRange(30, 5, 0, true)).toBe(15);
    expect(throwRange(30, 5, 3, true)).toBe(30);
    expect(throwRange(40, 5, 3, true)).toBe(33);
    expect(throwRange(40, 5, 3, false)).toBe(15);
  });
  it('Quick Recovery: wstawanie 1 AP zamiast 3', () => {
    expect(standUpApCost(true, 1)).toBe(1);
    expect(standUpApCost(true, 0)).toBe(3);
    expect(standUpApCost(false, 1)).toBe(3);
    expect(standUp(5, true, 1)).toBe(4);
    expect(standUp(2, true, 0)).toBe(0);
  });
  it('Night Vision: +0x3333 na rang, clamp 0x4000..0x10000', () => {
    expect(nightVisionLight(0x4000, 1)).toBe(0x7333);
    expect(nightVisionLight(0x0, 0)).toBe(0x4000);
    expect(nightVisionLight(0xf000, 1)).toBe(0x10000);
  });
});

describe('perki AP i obrazen potwierdzone (D)', () => {
  const b = { mode: 0, hasWeapon: true, protoPrimaryAp: 4, isPlayer: true };
  it('Bonus HtH (1) -1 AP klasy 1/2, Bonus RoF (5) -1 AP klasy 4, Bonus Move (3) 2 AP/ranga', () => {
    expect(attackApCost({ ...b, weaponClass: 1, perk1: 1 })).toBe(3);
    expect(attackApCost({ ...b, weaponClass: 4, perk1: 1 })).toBe(4);
    expect(attackApCost({ ...b, weaponClass: 4, perk5: 1 })).toBe(3);
    expect(freeMoveAp(2)).toBe(4);
  });
  it('Living Anatomy i Pyromaniac: +5 po petli, wyjatki', () => {
    const o = { attackerIsPlayer: true, damageType: DamageType.Fire };
    expect(totalDamage([10], { ...o, livingAnatomy: true, killType: 1 })).toBe(15);
    expect(totalDamage([10], { ...o, livingAnatomy: true, killType: 10 })).toBe(10);
    expect(totalDamage([10], { ...o, pyromaniac: true })).toBe(15);
    expect(totalDamage([10], { ...o, pyromaniac: true, damageType: DamageType.Normal })).toBe(10);
  });
});

describe('Enhanced Knockout (0x423714, D)', () => {
  it('perk broni 0x75: rand(1,100) <= ST-8, krytyk zawsze', () => {
    expect(enhancedKnockoutFlag(0x75, 10, false, rngOf(2))).toBe(true);
    expect(enhancedKnockoutFlag(0x75, 10, false, rngOf(3))).toBe(false);
    expect(enhancedKnockoutFlag(0x75, 5, true, rngOf(100))).toBe(true);
    expect(enhancedKnockoutFlag(0x3a, 10, true, rngOf(1))).toBe(false);
    expect(enhancedKnockoutFlag(undefined, 10, false, rngOf(1))).toBe(false);
  });
});
