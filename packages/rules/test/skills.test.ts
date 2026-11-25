import { describe, expect, it } from 'vitest';
import {
  Skill,
  defaultRulesContext,
  newCritterData,
  newSkillState,
  recalcDerived,
  skillDec,
  skillInc,
  skillLevel,
  skillPointCost,
  skillTag,
  type CritterData,
  type SkillCritter,
  type SkillPoolState,
} from '../src/index.js';

const ctx = defaultRulesContext();
type C = SkillCritter & SkillPoolState;

function make(p: number[], player = true): C {
  const base: CritterData = newCritterData(player);
  p.forEach((v, i) => (base.baseStats[i] = v));
  recalcDerived(base, ctx);
  return Object.assign(base, newSkillState(), { skillPoints: 0 });
}

// ST PE EN CH IN AG LK
const AVG = [5, 5, 5, 5, 5, 5, 5];

describe('skillLevel', () => {
  it('base formula for 3 sample characters', () => {
    const a = make(AVG);
    expect(skillLevel(a, Skill.SmallGuns, ctx)).toBe(25);
    expect(skillLevel(a, Skill.Unarmed, ctx)).toBe(50);
    expect(skillLevel(a, Skill.Steal, ctx)).toBe(15 + 0);
    const b = make([8, 4, 6, 3, 9, 7, 2]);
    expect(skillLevel(b, Skill.SmallGuns, ctx)).toBe(33);
    expect(skillLevel(b, Skill.Melee, ctx)).toBe(20 + 2 * 15);
    expect(skillLevel(b, Skill.Doctor, ctx)).toBe(5 + 13);
    expect(skillLevel(b, Skill.Speech, ctx)).toBe(15);
    expect(skillLevel(b, Skill.Gambling, ctx)).toBe(10);
    const c = make([1, 10, 1, 10, 10, 10, 10]);
    expect(skillLevel(c, Skill.Outdoorsman, ctx)).toBe(2 * 11);
    expect(skillLevel(c, Skill.Barter, ctx)).toBe(40);
    expect(skillLevel(c, Skill.Lockpick, ctx)).toBe(30);
  });
  it('difficulty adjusts skills 5..17 only for the player', () => {
    const a = make(AVG);
    expect(skillLevel(a, Skill.FirstAid, { ...ctx, difficulty: 0 })).toBe(20 + 20);
    expect(skillLevel(a, Skill.FirstAid, { ...ctx, difficulty: 2 })).toBe(20 - 10);
    expect(skillLevel(a, Skill.SmallGuns, { ...ctx, difficulty: 0 })).toBe(25);
    expect(skillLevel(a, Skill.Throwing, { ...ctx, difficulty: 0 })).toBe(
      skillLevel(a, Skill.Throwing, { ...ctx, difficulty: 1 }) + 20,
    );
    expect(skillLevel(make(AVG, false), Skill.FirstAid, { ...ctx, difficulty: 0 })).toBe(20);
  });
  it('tag adds bonus and doubles raw points', () => {
    const a = make(AVG);
    a.skillRaw[Skill.SmallGuns] = 10;
    expect(skillLevel(a, Skill.SmallGuns, ctx)).toBe(35);
    expect(skillTag(a, Skill.SmallGuns).ok).toBe(true);
    expect(skillLevel(a, Skill.SmallGuns, ctx)).toBe(65);
  });
  it('tag limit 3, 4 with Tag! perk', () => {
    const a = make(AVG);
    for (const s of [0, 1, 2]) expect(skillTag(a, s).ok).toBe(true);
    expect(skillTag(a, 3)).toEqual({ ok: false, reason: 'tag-limit' });
    expect(skillTag(a, 0)).toEqual({ ok: false, reason: 'skill-already-tagged' });
    a.perkRanks[51] = 1;
    expect(skillTag(a, 3).ok).toBe(true);
    // czwarty slot z perku nie dostaje stalych +20
    expect(skillLevel(a, Skill.Unarmed, ctx)).toBe(50);
  });
  it('traits, perks, and clamp', () => {
    const a = make(AVG);
    a.traits = [15, 10];
    expect(skillLevel(a, Skill.SmallGuns, ctx)).toBe(29 - 10 - 10); // Gifted: +1 do kazdego SPECIAL (AG 6)
    expect(skillLevel(a, Skill.Speech, ctx)).toBe(30 - 10 + 15);
    a.perkRanks[16] = 1;
    expect(skillLevel(a, Skill.Outdoorsman, ctx)).toBe(24 - 10 + 25);
    a.perkRanks[38] = 1;
    expect(skillLevel(a, Skill.Sneak, { ...ctx, playerLight: 100 })).toBe(23 - 10 + 20);
    a.skillRaw[Skill.Barter] = 500;
    expect(skillLevel(a, Skill.Barter, ctx)).toBe(300);
    expect(skillLevel(a, 99 as Skill, ctx)).toBe(-5);
  });
});

describe('skill points', () => {
  it('cost increases above thresholds', () => {
    const a = make(AVG);
    const at = (v: number): number => {
      a.skillRaw[Skill.Gambling] = v - 25;
      return skillPointCost(a, Skill.Gambling, ctx);
    };
    // Gambling base = 25 + difficulty(1)=0
    expect([at(100), at(101), at(125), at(126), at(150), at(151)]).toEqual([1, 2, 2, 3, 3, 4]);
    expect([at(175), at(176), at(200), at(201), at(299)]).toEqual([4, 5, 5, 6, 6]);
    expect(at(300)).toBe(Infinity);
  });
  it('skillInc fails without points', () => {
    const a = make(AVG);
    expect(skillInc(a, Skill.Barter, ctx)).toEqual({ ok: false, reason: 'no-skill-points' });
    a.skillPoints = 3;
    expect(skillInc(a, Skill.Barter, ctx).ok).toBe(true);
    expect(a.skillPoints).toBe(2);
    expect(a.skillRaw[Skill.Barter]).toBe(1);
    a.skillRaw[Skill.Barter] = 280;
    expect(skillInc(a, Skill.Barter, ctx)).toEqual({ ok: false, reason: 'skill-max' });
    a.skillRaw[Skill.Barter] = 100;
    a.skillPoints = 1;
    expect(skillInc(a, Skill.Gambling, ctx).ok).toBe(true);
    a.skillRaw[Skill.Gambling] = 80;
    expect(skillInc(a, Skill.Gambling, ctx).ok).toBe(false);
  });
  it('skillDec refunds and tag asymmetry', () => {
    const a = make(AVG);
    expect(skillDec(a, Skill.Barter, ctx)).toEqual({ ok: false, reason: 'skill-no-points' });
    a.skillRaw[Skill.Gambling] = 76; // 101
    expect(skillDec(a, Skill.Gambling, ctx).ok).toBe(true);
    expect(a.skillPoints).toBe(1);
    // tag: level 125 -> v-1=124 (koszt 2), po zwrocie 120+... raw 50 => 25+100+20=145?
    const t = make(AVG);
    skillTag(t, Skill.SmallGuns);
    t.skillRaw[Skill.SmallGuns] = 40; // 25+80+20=125
    expect(skillLevel(t, Skill.SmallGuns, ctx)).toBe(125);
    t.skillRaw[Skill.SmallGuns] = 41; // 127
    skillDec(t, Skill.SmallGuns, ctx); // tier(126)=3, po: 125 => tier 2 -> zwrot 2
    expect(t.skillPoints).toBe(2);
    const u = make(AVG);
    skillTag(u, Skill.SmallGuns);
    u.skillRaw[Skill.SmallGuns] = 41;
    skillDec(u, Skill.SmallGuns, { ...ctx, fixes: { skillRefundTagTier: true } });
    expect(u.skillPoints).toBe(3);
  });
});
