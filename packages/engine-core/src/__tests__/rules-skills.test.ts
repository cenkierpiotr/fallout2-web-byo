import { describe, expect, it } from 'vitest';
import {
  addExperience,
  inFrontCone,
  rollAgainst,
  rollDegree,
  sightRange,
  canSeeInRange,
  skillValue,
  statCheck,
  TICKS_PER_DAY,
} from '../rules-skills.js';

const stats = (m: Record<number, number>) => (s: number) => m[s] ?? 5;
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++]!;
};

describe('skillValue', () => {
  it('small guns = 5 + 4*AG', () => expect(skillValue(0, stats({ 5: 7 }))).toBe(33));
  it('first aid = 2*(PE+IN)', () => expect(skillValue(6, stats({ 1: 6, 4: 4 }))).toBe(20));
  it('punkty i tag', () => {
    expect(skillValue(0, stats({ 5: 5 }), { points: 10 })).toBe(35);
    expect(skillValue(0, stats({ 5: 5 }), { points: 10, tagged: true })).toBe(65);
    expect(skillValue(0, stats({ 5: 5 }), { points: 10, tagged: true, tag4Perk: true })).toBe(45);
  });
  it('limit 300 i zakres', () => {
    expect(skillValue(0, stats({ 5: 10 }), { points: 999 })).toBe(300);
    expect(skillValue(18, stats({}))).toBe(-5);
    expect(skillValue(-1, stats({}))).toBe(-5);
  });
});

describe('rollDegree', () => {
  it('przed pierwsza doba brak krytykow', () => {
    expect(rollDegree(50, 99, 0, () => 1)).toBe(2);
    expect(rollDegree(-50, 99, TICKS_PER_DAY - 1, () => 1)).toBe(1);
  });
  it('po dobie: krytyk sukcesu gdy d100 <= delta/10 + crit', () => {
    expect(rollDegree(40, 5, TICKS_PER_DAY, () => 9)).toBe(3);
    expect(rollDegree(40, 5, TICKS_PER_DAY, () => 10)).toBe(2);
  });
  it('po dobie: krytyk porazki gdy d100 <= -delta/10', () => {
    expect(rollDegree(-40, 5, TICKS_PER_DAY, () => 4)).toBe(0);
    expect(rollDegree(-40, 5, TICKS_PER_DAY, () => 5)).toBe(1);
  });
  it('delta 0 to sukces', () => expect(rollDegree(0, 0, 0, () => 1)).toBe(2));
  it('rollAgainst liczy delta = szansa - d100', () => {
    expect(rollAgainst(60, 0, 0, seq(25))).toEqual({ degree: 2, delta: 35 });
    expect(rollAgainst(60, 0, 0, seq(90))).toEqual({ degree: 1, delta: -30 });
  });
});

describe('addExperience', () => {
  it('bez perku', () => expect(addExperience(100, 50, 0)).toBe(150));
  it('Swift Learner +5% za rank', () => expect(addExperience(0, 100, 2)).toBe(110));
  it('przyciecie', () => {
    expect(addExperience(5, -50, 0)).toBe(0);
    expect(addExperience(2147483000, 5000, 0)).toBe(2147483647);
  });
});

describe('widzenie', () => {
  it('zasieg', () => {
    expect(sightRange(6, true, false)).toBe(30);
    expect(sightRange(6, true, true)).toBe(15);
    expect(sightRange(6, false, false)).toBe(6);
  });
  it('stozek', () => {
    expect([0, 1, 5].map((d) => inFrontCone(0, d))).toEqual([true, true, true]);
    expect([2, 3, 4].map((d) => inFrontCone(0, d))).toEqual([false, false, false]);
  });
});

describe('statCheck (do_check, 0x4afa78)', () => {
  it('d10 pod stat+mod: roll <= suma to sukces (2), delta = suma - roll', () => {
    expect(statCheck(5, 3, () => 5)).toEqual({ degree: 2, delta: 3 });
    expect(statCheck(5, 0, () => 6)).toEqual({ degree: 1, delta: -1 });
  });
  it('rzut z zakresu 1..10, bez krytykow', () => {
    const calls: number[][] = [];
    statCheck(5, 0, (a, b) => (calls.push([a, b]), 1));
    expect(calls).toEqual([[1, 10]]);
    expect(statCheck(1, -5, () => 10).degree).toBe(1);
  });

  it('canSeeInRange 0x42ba04: skradanie gracza i druga galaz po porazce w stozku', () => {
    expect(canSeeInRange(30, 6, true)).toBe(true);
    expect(canSeeInRange(31, 6, true)).toBe(false);
    expect(canSeeInRange(7, 6, false, { doubled: true })).toBe(true);
    expect(canSeeInRange(20, 6, true, { targetIsPlayer: true, sneaking: true })).toBe(true);
    expect(canSeeInRange(21, 6, true, { targetIsPlayer: true, sneaking: true })).toBe(false);
    expect(
      canSeeInRange(6, 6, true, { targetIsPlayer: true, sneakSuccess: true, sneakSkill: 130 }),
    ).toBe(true);
    expect(
      canSeeInRange(7, 6, true, { targetIsPlayer: true, sneakSuccess: true, sneakSkill: 130 }),
    ).toBe(false);
    expect(canSeeInRange(21, 6, true, { sneaking: true })).toBe(true);
  });
});
