import { describe, expect, it } from 'vitest';
import {
  Perk,
  Stat,
  defaultRulesContext,
  newCritterData,
  newSkillState,
  perkAddScripted,
  perkLevel,
  perkRemoveAllScripted,
  skillIncForce,
  skillLevel,
  skillModScripted,
  statLevel,
  type SkillCritter,
} from '../src/index.js';

function pc(): SkillCritter {
  return { ...newCritterData(true), ...newSkillState() };
}
const ctx = defaultRulesContext();

describe('critter_add_trait/critter_rm_trait (perk) 0x496a9c/0x496afc', () => {
  it('dodaje range bez wymagan i respektuje maxRank', () => {
    const c = pc();
    expect(perkAddScripted(c, Perk.BonusHtHDamage).ok).toBe(true); // maxRank 3, ST6 niespelnione: pomijane
    expect(perkAddScripted(c, Perk.BonusHtHDamage).ok).toBe(true);
    expect(perkAddScripted(c, Perk.BonusHtHDamage).ok).toBe(true);
    expect(perkAddScripted(c, Perk.BonusHtHDamage).ok).toBe(false);
    expect(perkLevel(c, Perk.BonusHtHDamage)).toBe(3);
    expect(statLevel(c, Stat.MeleeDamage, ctx)).toBe(1 + 6);
  });
  it('odrzuca perk spoza 0..118', () => {
    expect(perkAddScripted(pc(), 119 as Perk).ok).toBe(false);
    expect(perkAddScripted(pc(), -1 as Perk).ok).toBe(false);
  });
  it('rm zdejmuje wszystkie rangi i cofa efekty', () => {
    const c = pc();
    perkAddScripted(c, Perk.BonusHtHDamage);
    perkAddScripted(c, Perk.BonusHtHDamage);
    perkRemoveAllScripted(c, Perk.BonusHtHDamage);
    expect(perkLevel(c, Perk.BonusHtHDamage)).toBe(0);
    expect(c.bonusStats[Stat.MeleeDamage] ?? 0).toBe(0);
  });
});

describe('critter_mod_skill 0x45b840 / skill_inc_force 0x4aa7f8', () => {
  it('gracz: +N surowych punktow (bez kosztu puli)', () => {
    const c = pc();
    const before = skillLevel(c, 0, ctx);
    skillModScripted(c, 0, 3, ctx);
    expect(c.skillRaw[0]).toBe(3);
    expect(skillLevel(c, 0, ctx)).toBe(before + 3);
  });
  it('tagowany skill: liczba punktow dzielona przez 2', () => {
    const c = pc();
    c.tags[0] = 0;
    skillModScripted(c, 0, 5, ctx);
    expect(c.skillRaw[0]).toBe(2);
  });
  it('kwirk oryginalu: ujemna kwota tez zwieksza (|amount|), zero = blad', () => {
    const c = pc();
    expect(skillModScripted(c, 1, -4, ctx)).toBe(0);
    expect(c.skillRaw[1]).toBe(4);
    expect(skillModScripted(c, 1, 0, ctx)).toBe(0);
    expect(c.skillRaw[1]).toBe(4);
  });
  it('nie-gracz bez zmian; skill poza 0..17 bez zmian', () => {
    const n = { ...newCritterData(false), ...newSkillState() };
    skillModScripted(n, 0, 3, ctx);
    expect(n.skillRaw[0]).toBe(0);
    const c = pc();
    expect(skillIncForce(c, 18, ctx)).toBe(-5);
  });
  it('limit 300 (-3)', () => {
    const c = pc();
    c.skillRaw[0] = 300;
    expect(skillIncForce(c, 0, ctx)).toBe(-3);
  });
});
