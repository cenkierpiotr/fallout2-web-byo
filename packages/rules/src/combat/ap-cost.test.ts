import { describe, expect, it } from 'vitest';
import { attackApCost, moveStepCost } from './ap.js';
import { criticalStatCheck } from './critical.js';
import { distanceModifier } from './to-hit.js';
import { RollResult } from '../roll.js';

describe('attackApCost (0x478b24)', () => {
  it('piesc bez broni 3, celowany +1', () => {
    expect(attackApCost({ mode: 1, hasWeapon: false })).toBe(3);
    expect(attackApCost({ mode: 1, hasWeapon: false, aimed: true })).toBe(4);
  });
  it('bron: koszt z proto, Fast Shot -1 dla zasiegu > 2, perk 5 dla klasy 4', () => {
    const b = {
      mode: 0,
      hasWeapon: true,
      protoPrimaryAp: 5,
      isPlayer: true,
      weaponClass: 4,
      weaponRange: 20,
    };
    expect(attackApCost(b)).toBe(5);
    expect(attackApCost({ ...b, fastShot: true })).toBe(4);
    expect(attackApCost({ ...b, perk5: 1 })).toBe(4);
    expect(attackApCost({ ...b, fastShot: true, perk5: 1, aimed: true })).toBe(4);
  });
  it('stale tryby i minimum 1', () => {
    expect(attackApCost({ mode: 0xc, hasWeapon: true })).toBe(6);
    expect(attackApCost({ mode: 7, hasWeapon: true })).toBe(2);
    expect(
      attackApCost({
        mode: 0,
        hasWeapon: true,
        protoPrimaryAp: 1,
        isPlayer: true,
        fastShot: true,
        weaponRange: 9,
      }),
    ).toBe(1);
  });
});

describe('moveStepCost (0x42e62c)', () => {
  it('nogi', () => {
    expect(moveStepCost(true, 0, 3)).toBe(3);
    expect(moveStepCost(true, 0x4, 3)).toBe(12);
    expect(moveStepCost(true, 0xc, 3)).toBe(24);
    expect(moveStepCost(false, 0xc, 3)).toBe(0);
  });
});

describe('distanceModifier (combat.md krok 3)', () => {
  it('NPC pe 5 dist 10 mult 2: d=0 -> 0', () => {
    expect(distanceModifier({ dist: 10, perception: 5, isPlayer: false, useDistance: true })).toBe(
      -0,
    );
  });
  it('gracz pe 6 dist 10: d=10-(4*2)=2 -> -8', () => {
    expect(distanceModifier({ dist: 10, perception: 6, isPlayer: true, useDistance: true })).toBe(
      -8,
    );
  });
  it('Scope Range: dist < 8 dodaje minDist', () => {
    expect(
      distanceModifier({
        dist: 3,
        perception: 5,
        isPlayer: false,
        weaponPerk: 0x40,
        useDistance: true,
      }),
    ).toBe(-44);
  });
  it('bonus tylko gdy useDistance albo r > 0', () => {
    expect(distanceModifier({ dist: 20, perception: 5, isPlayer: false, useDistance: false })).toBe(
      0,
    );
    expect(
      distanceModifier({ dist: 1, perception: 5, isPlayer: false, useDistance: false }),
    ).toBeGreaterThan(0);
  });
});

describe('criticalStatCheck (0x4afa78)', () => {
  it('d10 <= stat+mod', () => {
    expect(criticalStatCheck(5, 0, 5)).toBe(RollResult.Success);
    expect(criticalStatCheck(5, -2, 4)).toBe(RollResult.Failure);
  });
});
