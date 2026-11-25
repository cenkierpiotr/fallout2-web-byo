import { describe, expect, it, vi } from 'vitest';
import { Skill, Stat, Trait, defaultRulesContext, statLevel } from '../../rules/src/index.js';
import type { CreatorCommands, CreatorView } from '../../ui/src/screens/creator/types.js';
import {
  createCreatorBinding,
  type CreatorPreset,
  type CreatorTexts,
} from '../src/creator-binding.js';

const texts: CreatorTexts = {
  stat: (i) => ({ name: `stat${i}`, description: `opis stat${i}` }),
  skill: (i) => ({ name: `skill${i}`, description: `opis skill${i}` }),
  trait: (i) => ({ name: `trait${i}`, description: `opis trait${i}` }),
};

const presets: CreatorPreset[] = [
  {
    id: 'combat',
    name: 'Narvil',
    bio: 'bio',
    gender: 'male',
    age: 25,
    special: [5, 6, 6, 4, 6, 8, 5],
    tags: [Skill.SmallGuns, Skill.Unarmed, Skill.Throwing],
    traits: [Trait.Gifted, -1],
    pool: 0,
  },
];

function setup() {
  const onFinish = vi.fn();
  const b = createCreatorBinding({
    presets,
    texts,
    rulesContext: () => defaultRulesContext(),
    onFinish,
  });
  return { b, onFinish };
}

describe('creator-binding', () => {
  it('start: 5 punktow, SPECIAL 5, brak tagow, powody blokady', () => {
    const { b } = setup();
    const v: CreatorView = b.view.value;
    expect(v.pointsLeft).toBe(5);
    expect(v.stats.map((s) => s.value)).toEqual([5, 5, 5, 5, 5, 5, 5]);
    expect(v.stats).toHaveLength(7);
    expect(v.skills).toHaveLength(18);
    expect(v.reasons).toEqual(['statPoints', 'tags', 'name']);
    expect(v.canFinish).toBe(false);
    expect(v.presets[0]?.special).toEqual([5, 6, 6, 4, 6, 8, 5]);
  });

  it('finish rejects when points remain', () => {
    const { b, onFinish } = setup();
    b.commands.setName('Test');
    expect(b.commands.finish()).toEqual({ ok: false, reason: 'points-unspent' });
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('adjustStat: +1 zuzywa pule, limit 10, brak punktow, -1 zwraca', () => {
    const { b } = setup();
    const c: CreatorCommands = b.commands;
    for (let i = 0; i < 5; i++) expect(c.adjustStat(Stat.Strength, 1)).toEqual({ ok: true });
    expect(b.view.value.stats[0]?.value).toBe(10);
    expect(b.view.value.pointsLeft).toBe(0);
    expect(c.adjustStat(Stat.Perception, 1)).toEqual({ ok: false, reason: 'noPoints' });
    expect(c.adjustStat(Stat.Strength, -1)).toEqual({ ok: true });
    expect(b.view.value.pointsLeft).toBe(1);
    // limit 10 przy wolnej puli
    expect(c.adjustStat(Stat.Perception, -1)).toEqual({ ok: true });
    expect(c.adjustStat(Stat.Strength, 1)).toEqual({ ok: true });
    expect(c.adjustStat(Stat.Strength, 1)).toEqual({ ok: false, reason: 'statMax' });
  });

  it('toggleTag: do 3, tag dodaje 20 do skilla, powyzej limitu blad', () => {
    const { b } = setup();
    const before = b.view.value.skills[Skill.Lockpick]?.value ?? 0;
    expect(b.commands.toggleTag(Skill.Lockpick)).toEqual({ ok: true });
    expect(b.view.value.skills[Skill.Lockpick]?.value).toBe(before + 20);
    b.commands.toggleTag(Skill.Steal);
    b.commands.toggleTag(Skill.Traps);
    expect(b.view.value.tagsUsed).toBe(3);
    expect(b.commands.toggleTag(Skill.Science)).toEqual({ ok: false, reason: 'tagsFull' });
    expect(b.commands.toggleTag(Skill.Lockpick)).toEqual({ ok: true });
    expect(b.view.value.tagsUsed).toBe(2);
  });

  it('toggleTrait: do 2', () => {
    const { b } = setup();
    expect(b.commands.toggleTrait(Trait.Bruiser)).toEqual({ ok: true });
    expect(b.commands.toggleTrait(Trait.FastShot)).toEqual({ ok: true });
    expect(b.commands.toggleTrait(Trait.Jinxed)).toEqual({ ok: false, reason: 'traitsFull' });
    expect(b.view.value.traitsUsed).toBe(2);
    expect(b.view.value.derived.find((d) => d.id === 'ap')?.value).toBeDefined();
  });

  it('finish creates player with preset', () => {
    const { b, onFinish } = setup();
    expect(b.commands.applyPreset('combat')).toEqual({ ok: true });
    const v = b.view.value;
    expect(v.presetId).toBe('combat');
    expect(v.name).toBe('Narvil');
    expect(v.pointsLeft).toBe(0);
    expect(v.tagsUsed).toBe(3);
    expect(v.canFinish).toBe(true);
    expect(b.commands.finish()).toEqual({ ok: true });
    expect(onFinish).toHaveBeenCalledTimes(1);
    const r = onFinish.mock.calls[0]?.[0];
    expect(r.name).toBe('Narvil');
    expect(r.critter.isPlayer).toBe(true);
    expect(statLevel(r.critter, Stat.Agility, defaultRulesContext())).toBe(9); // 8 + Gifted;
    expect(r.critter.tags.slice(0, 3)).toEqual([Skill.SmallGuns, Skill.Unarmed, Skill.Throwing]);
    expect(r.critter.level).toBe(1);
    expect(r.critter.curHP).toBe(statLevel(r.critter, Stat.MaxHitPoints, defaultRulesContext()));
  });

  it('setName obcina do 11 znakow, setAge ogranicza 16..35, gender', () => {
    const { b } = setup();
    b.commands.setName('abcdefghijklmnop');
    expect(b.view.value.name).toHaveLength(11);
    b.commands.setAge(99);
    expect(b.view.value.age).toBe(35);
    b.commands.setAge(1);
    expect(b.view.value.age).toBe(16);
    b.commands.setGender('female');
    expect(b.view.value.gender).toBe('female');
  });

  it('applyPreset z nieznanym id', () => {
    const { b } = setup();
    expect(b.commands.applyPreset('x')).toEqual({ ok: false, reason: 'unknownPreset' });
  });
});
