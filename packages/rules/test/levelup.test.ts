import { describe, expect, it } from 'vitest';
import {
  Stat,
  addExperience,
  defaultRulesContext,
  expForLevel,
  levelUp,
  newCritterData,
  newProgressState,
  perkDueAtLevel,
  recalcDerived,
  statLevel,
  type ProgressCritter,
} from '../src/index.js';

const ctx = defaultRulesContext();

function make(p: number[]): ProgressCritter {
  const base = newCritterData(true);
  p.forEach((v, i) => (base.baseStats[i] = v));
  recalcDerived(base, ctx);
  base.curHP = statLevel(base, Stat.MaxHitPoints, ctx);
  return Object.assign(base, newProgressState());
}

describe('expForLevel', () => {
  it('table', () => {
    expect([2, 3, 4, 5, 6, 7, 8, 9, 10].map(expForLevel)).toEqual([
      1000, 3000, 6000, 10000, 15000, 21000, 28000, 36000, 45000,
    ]);
    expect(expForLevel(98)).toBe(4753000);
    expect(expForLevel(99)).toBe(-1);
  });
  it('matches xp curve 1..99', () => {
    expect(expForLevel(1)).toBe(0);
    for (let l = 2; l <= 98; l++) expect(expForLevel(l)).toBe(l * (l - 1) * 500);
    expect(expForLevel(99)).toBe(-1);
  });
});

describe('levelUp', () => {
  it('grants hp and skill points', () => {
    const c = make([5, 5, 6, 5, 7, 5, 5]); // EN6 IN7
    const hp0 = c.curHP;
    const r = levelUp(c, ctx);
    expect(r.hpGained).toBe(3 + 2);
    expect(c.curHP).toBe(hp0 + 5);
    expect(statLevel(c, Stat.MaxHitPoints, ctx)).toBe(hp0 + 5);
    expect(r.skillPoints).toBe(5 + 14);
    expect(c.level).toBe(2);
    expect(c.skillPoints).toBe(19);
  });
  it('Lifegiver, Educated, Skilled, Gifted', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    c.perkRanks[28] = 2;
    c.perkRanks[18] = 2;
    c.traits = [14, -1];
    const r = levelUp(c, ctx);
    expect(r.hpGained).toBe(2 + 2 + 8);
    expect(r.skillPoints).toBe(5 + 10 + 4 + 5);
    const g = make([5, 5, 5, 5, 1, 5, 5]);
    g.traits = [15, -1]; // IN 1+1=2: 5+4-5
    expect(levelUp(g, ctx).skillPoints).toBe(4);
    g.skillPoints = 98;
    g.traits = [-1, -1];
    expect(levelUp(g, ctx).skillPoints).toBe(99);
  });
  it('perk every 3 levels, every 4 with Skilled', () => {
    expect([3, 6, 9].every((l) => perkDueAtLevel(l, false))).toBe(true);
    expect(perkDueAtLevel(4, false)).toBe(false);
    expect([4, 8].every((l) => perkDueAtLevel(l, true))).toBe(true);
    expect(perkDueAtLevel(3, true)).toBe(false);
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    c.level = 2;
    expect(levelUp(c, ctx).perkAvailable).toBe(true);
    expect(c.perkPending).toBe(true);
    c.level = 5;
    c.perkPending = false;
    for (let i = 0; i < 37; i++) c.perkRanks[i] = 1;
    expect(levelUp(c, ctx).perkAvailable).toBe(false);
  });
});

describe('addExperience', () => {
  it('multiple levels at once', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    expect(addExperience(c, 3000, ctx).levelsGained).toBe(2);
    expect(c.level).toBe(3);
    expect(c.xp).toBe(3000);
  });
  it('Swift Learner multiplies exp', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    c.perkRanks[50] = 3;
    addExperience(c, 99, ctx);
    expect(c.xp).toBe(99 + 14);
    const d = make([5, 5, 5, 5, 5, 5, 5]);
    d.perkRanks[50] = 2;
    expect(addExperience(d, 950, ctx).levelsGained).toBe(1);
    expect(d.xp).toBe(1045);
  });
  it('level 98 jumps to 99 at once', () => {
    const c = make([5, 5, 5, 5, 5, 5, 5]);
    c.level = 98;
    c.xp = expForLevel(98);
    expect(addExperience(c, 0, ctx).levelsGained).toBe(1);
    expect(c.level).toBe(99);
  });
});
