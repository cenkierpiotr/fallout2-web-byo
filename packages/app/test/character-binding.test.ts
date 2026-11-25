import { describe, expect, it } from 'vitest';
import {
  Perk,
  Skill,
  Stat,
  defaultRulesContext,
  newCritterData,
  newGameObject,
  newProgressState,
  newSkillState,
  recalcDerived,
  setStatBase,
  type ProgressCritter,
  type SkillCritter,
} from '../../rules/src/index.js';
import type { CharacterCommands, PlayerView } from '../../ui/src/screens/character/types.js';
import { createCharacterBinding, type CharacterTexts } from '../src/character-binding.js';

type Player = SkillCritter & ProgressCritter;

function makePlayer(): Player {
  const c = Object.assign(newCritterData(true), newSkillState(), newProgressState()) as Player;
  for (let s = 0; s < 7; s++) setStatBase(c, s as Stat, 5);
  recalcDerived(c);
  c.curHP = c.baseStats[Stat.MaxHitPoints] ?? 0;
  return c;
}

const texts: CharacterTexts = {
  perk: (id) => ({ name: `perk${id}`, description: `opis${id}` }),
  trait: (id) => ({ name: `trait${id}`, description: `opis${id}` }),
};

function setup(over: Partial<Player> = {}) {
  const critter = Object.assign(makePlayer(), over);
  const obj = newGameObject(1, 16777216, critter);
  const b = createCharacterBinding({
    player: obj,
    name: 'Wybraniec',
    texts,
    rulesContext: () => ({ ...defaultRulesContext(), rng: { int: (min) => min } }),
    karma: () => 0,
    karmaTitle: () => 'Neutral',
  });
  return { critter, b };
}

describe('character-binding', () => {
  it('view: 38 statow, 18 skilli, level i expNext', () => {
    const { b } = setup();
    const v: PlayerView = b.view.value;
    expect(v.stats).toHaveLength(38);
    expect(v.skills).toHaveLength(18);
    expect(v.level).toBe(1);
    expect(v.expNext).toBe(1000);
    expect(v.hpMax).toBe(v.stats[Stat.MaxHitPoints]?.level);
    expect(v.stats[Stat.Strength]?.level).toBe(5);
    expect(v.skillCostTiers[0]).toEqual({ upTo: 100, cost: 1 });
    expect(v.skillMax).toBe(300);
    expect(v.name).toBe('Wybraniec');
  });

  it('spendSkill +1 zuzywa punkty i podnosi skill, -1 zwraca', () => {
    const { b, critter } = setup({ skillPoints: 3 });
    const before = b.view.value.skills[Skill.Lockpick]?.level ?? 0;
    const cmd: CharacterCommands = b.commands;
    expect(cmd.spendSkill(Skill.Lockpick, 1)).toEqual({ ok: true });
    expect(critter.skillPoints).toBe(2);
    expect(b.view.value.skillPoints).toBe(2);
    expect(b.view.value.skills[Skill.Lockpick]?.level).toBe(before + 1);
    expect(cmd.spendSkill(Skill.Lockpick, -1)).toEqual({ ok: true });
    expect(critter.skillPoints).toBe(3);
  });

  it('spendSkill bez punktow zwraca blad', () => {
    const { b } = setup({ skillPoints: 0 });
    expect(b.commands.spendSkill(Skill.Lockpick, 1)).toEqual({
      ok: false,
      reason: 'no-skill-points',
    });
  });

  it('gainExperience: awans ustawia levelUpPending, confirmLevelUp go czysci', () => {
    const { b, critter } = setup();
    const r = b.gainExperience(1000);
    expect(r.levelsGained).toBe(1);
    expect(critter.level).toBe(2);
    expect(b.view.value.levelUpPending).toBe(true);
    expect(b.view.value.skillPoints).toBeGreaterThan(0);
    expect(b.commands.confirmLevelUp()).toEqual({ ok: true });
    expect(b.view.value.levelUpPending).toBe(false);
  });

  it('choosePerk tylko z availablePerks i tylko gdy perk czeka', () => {
    const { b, critter } = setup({ level: 3, perkPending: true, xp: 3000 });
    critter.perkRanks[Perk.Awareness] = 0;
    const v = b.view.value;
    expect(v.unspentPerks).toBe(1);
    const opt = v.availablePerks.find((p) => p.available);
    expect(opt).toBeDefined();
    const bad = v.availablePerks.find((p) => !p.available);
    expect(bad?.unmet.length).toBeGreaterThan(0);
    expect(b.commands.choosePerk(bad?.id ?? -1).ok).toBe(false);
    expect(b.commands.choosePerk(opt?.id ?? -1)).toEqual({ ok: true });
    expect(critter.perkPending).toBe(false);
    expect(b.view.value.unspentPerks).toBe(0);
    expect(b.view.value.perks.some((p) => p.id === opt?.id && p.rank === 1)).toBe(true);
    expect(b.commands.choosePerk(opt?.id ?? -1)).toEqual({ ok: false, reason: 'no-perk-pending' });
  });

  it('confirmLevelUp odmawia gdy perk nie wybrany', () => {
    const { b } = setup({ level: 3, perkPending: true });
    expect(b.commands.confirmLevelUp()).toEqual({ ok: false, reason: 'perk-pending' });
  });

  it('subskrybent dostaje nowy widok po komendzie', () => {
    const { b } = setup({ skillPoints: 2 });
    let n = 0;
    b.view.subscribe(() => n++);
    const start = n;
    b.commands.spendSkill(Skill.Lockpick, 1);
    expect(n).toBeGreaterThan(start);
  });
});
