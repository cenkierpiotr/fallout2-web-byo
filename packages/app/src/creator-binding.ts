/**
 * Adapter kreatora postaci (@f2/rules) do widoku i komend ekranu kreatora z @f2/ui
 * (`CreatorView`, `CreatorCommands`). Plan M4 Z14: `GameView.creator` + `creator.*`.
 * Stan to prawdziwy rekord krytera gracza; `finish` oddaje go wywolujacemu (onFinish).
 */
import {
  SKILL_COUNT,
  Stat,
  TRAIT_COUNT,
  newCritterData,
  newProgressState,
  newSkillState,
  recalcDerived,
  setStatBase,
  setTraits,
  skillIsTagged,
  skillLevel,
  skillTag,
  skillUntag,
  specialPoolDec,
  specialPoolInc,
  statBase,
  statLevel,
  NEW_CHARACTER_SPECIAL_POINTS,
  type Skill,
  type SkillsContext,
  type SpecialPool,
  type Trait,
} from '../../rules/src/index.js';
import {
  STAT_MAX,
  STAT_MIN,
  TAGS_REQUIRED,
  TRAITS_MAX,
  type CreatorCommands,
  type CreatorReason,
  type CreatorResult,
  type CreatorView,
} from '../../ui/src/screens/creator/types.js';
import type { PlayerCritter } from './character-binding.js';
import { createStore, type Store } from './store.js';

export interface CreatorPreset {
  id: string;
  name: string;
  bio: string;
  gender: 'male' | 'female';
  age: number;
  /** ST PE EN CH IN AG LK. */
  special: number[];
  tags: number[];
  /** Do 2 traitow, -1 = pusty slot. */
  traits: number[];
  /** Nierozdane punkty SPECIAL po wczytaniu (premade: 0). */
  pool?: number;
}

export interface CreatorTexts {
  stat(id: number): { name: string; description: string };
  skill(id: number): { name: string; description: string };
  trait(id: number): { name: string; description: string };
}

export interface CreatedCharacter {
  critter: PlayerCritter;
  name: string;
  age: number;
  gender: 'male' | 'female';
  presetId: string | null;
}

export interface CreatorBindingDeps {
  presets: readonly CreatorPreset[];
  texts: CreatorTexts;
  rulesContext: () => SkillsContext;
  onFinish: (c: CreatedCharacter) => void;
  maxNameLength?: number;
}

export interface CreatorBinding {
  view: Store<CreatorView>;
  commands: CreatorCommands;
  /** Biezacy rekord krytera (edytowany na zywo). */
  critter(): PlayerCritter;
}

const AGE_MIN = 16;
const AGE_MAX = 35;
const DEFAULT_AGE = 25;
const SPECIAL = 7;

const ok: CreatorResult = { ok: true };
const fail = (reason: string): CreatorResult => ({ ok: false, reason });

function freshCritter(ctx: SkillsContext): PlayerCritter {
  const c = Object.assign(
    newCritterData(true),
    newSkillState(),
    newProgressState(),
  ) as PlayerCritter;
  for (let s = 0; s < SPECIAL; s++) setStatBase(c, s as Stat, 5, ctx);
  setStatBase(c, Stat.Age, DEFAULT_AGE, ctx);
  recalcDerived(c, ctx);
  c.curHP = statLevel(c, Stat.MaxHitPoints, ctx);
  return c;
}

export function createCreatorBinding(deps: CreatorBindingDeps): CreatorBinding {
  const maxName = deps.maxNameLength ?? 11;
  const ctx = (): SkillsContext => deps.rulesContext();
  let critter = freshCritter(ctx());
  let pool: SpecialPool = { points: NEW_CHARACTER_SPECIAL_POINTS };
  let name = '';
  let age = DEFAULT_AGE;
  let gender: 'male' | 'female' = 'male';
  let presetId: string | null = null;

  const tagCount = (): number => critter.tags.filter((t) => t >= 0).length;
  const traitCount = (): number => critter.traits.filter((t) => t >= 0).length;

  function reasons(): CreatorReason[] {
    const r: CreatorReason[] = [];
    if (pool.points > 0) r.push('statPoints');
    if (tagCount() < TAGS_REQUIRED) r.push('tags');
    if (name.trim() === '') r.push('name');
    return r;
  }

  function build(): CreatorView {
    const c = ctx();
    const rs = reasons();
    const stats = [];
    for (let id = 0; id < SPECIAL; id++) {
      stats.push({
        id,
        ...deps.texts.stat(id),
        value: statLevel(critter, id as Stat, c),
        min: STAT_MIN,
        max: STAT_MAX,
      });
    }
    const skills = [];
    for (let id = 0; id < SKILL_COUNT; id++) {
      skills.push({
        id,
        ...deps.texts.skill(id),
        value: skillLevel(critter, id as Skill, c),
        tagged: skillIsTagged(critter, id),
      });
    }
    const traits = [];
    for (let id = 0; id < TRAIT_COUNT; id++) {
      traits.push({ id, ...deps.texts.trait(id), selected: critter.traits.includes(id) });
    }
    return {
      name,
      age,
      ageMin: AGE_MIN,
      ageMax: AGE_MAX,
      gender,
      presetId,
      presets: deps.presets.map((p) => ({
        id: p.id,
        name: p.name,
        bio: p.bio,
        special: [...p.special],
      })),
      stats,
      pointsLeft: pool.points,
      skills,
      tagsUsed: tagCount(),
      traits,
      traitsUsed: traitCount(),
      derived: [
        { id: 'hp', value: statLevel(critter, Stat.MaxHitPoints, c) },
        { id: 'ap', value: statLevel(critter, Stat.MaxActionPoints, c) },
        { id: 'ac', value: statLevel(critter, Stat.ArmorClass, c) },
        { id: 'carry', value: statLevel(critter, Stat.CarryWeight, c) },
      ],
      reasons: rs,
      canFinish: rs.length === 0,
    };
  }

  const store = createStore<CreatorView>(build());
  const update = (r: CreatorResult): CreatorResult => {
    // maxHP/AP/AC zaleza od SPECIAL i traitow: leczymy do pelna jak w kreatorze oryginalu.
    critter.curHP = statLevel(critter, Stat.MaxHitPoints, ctx());
    store.value = build();
    return r;
  };

  const commands: CreatorCommands = {
    setName(n) {
      name = n.slice(0, maxName);
      return update(ok);
    },
    setAge(a) {
      age = Math.min(AGE_MAX, Math.max(AGE_MIN, Math.round(a)));
      setStatBase(critter, Stat.Age, age, ctx());
      return update(ok);
    },
    setGender(g) {
      gender = g;
      setStatBase(critter, Stat.Gender, g === 'female' ? 1 : 0, ctx());
      return update(ok);
    },
    applyPreset(id) {
      const p = deps.presets.find((x) => x.id === id);
      if (!p) return fail('unknownPreset');
      const c = ctx();
      const next = freshCritter(c);
      setTraits(next, null, null);
      p.special.slice(0, SPECIAL).forEach((v, s) => setStatBase(next, s as Stat, v, c));
      next.tags = [-1, -1, -1, -1];
      p.tags.slice(0, TAGS_REQUIRED).forEach((t) => skillTag(next, t as Skill));
      const [a, b] = p.traits.filter((t) => t >= 0);
      setTraits(next, (a ?? null) as Trait | null, (b ?? null) as Trait | null);
      setStatBase(next, Stat.Age, p.age, c);
      setStatBase(next, Stat.Gender, p.gender === 'female' ? 1 : 0, c);
      recalcDerived(next, c);
      critter = next;
      pool = { points: p.pool ?? 0 };
      name = p.name.slice(0, maxName);
      age = p.age;
      gender = p.gender;
      presetId = p.id;
      return update(ok);
    },
    adjustStat(id, delta) {
      if (!Number.isInteger(id) || id < 0 || id >= SPECIAL) return fail('unknownStat');
      const c = ctx();
      const cur = statBase(critter, id as Stat) ?? 0;
      if (delta > 0 && pool.points <= 0) return fail('noPoints');
      if (delta > 0 && cur >= STAT_MAX) return fail('statMax');
      if (delta < 0 && cur <= STAT_MIN) return fail('statMin');
      const r =
        delta > 0
          ? specialPoolInc(critter, pool, id as Stat, c)
          : specialPoolDec(critter, pool, id as Stat, c);
      if (!r.ok) return fail(r.reason);
      presetId = null;
      return update(ok);
    },
    toggleTag(id) {
      if (!Number.isInteger(id) || id < 0 || id >= SKILL_COUNT) return fail('unknownSkill');
      if (skillIsTagged(critter, id)) {
        skillUntag(critter, id as Skill);
        return update(ok);
      }
      if (tagCount() >= TAGS_REQUIRED) return fail('tagsFull');
      const r = skillTag(critter, id as Skill);
      return update(r.ok ? ok : fail(r.reason));
    },
    toggleTrait(id) {
      if (!Number.isInteger(id) || id < 0 || id >= TRAIT_COUNT) return fail('unknownTrait');
      const cur = critter.traits.filter((t) => t >= 0);
      if (cur.includes(id)) {
        const rest = cur.filter((t) => t !== id);
        setTraits(critter, (rest[0] ?? null) as Trait | null, null);
        return update(ok);
      }
      if (cur.length >= TRAITS_MAX) return fail('traitsFull');
      const r = setTraits(
        critter,
        ...((cur.length === 0 ? [id as Trait, null] : [cur[0] as Trait, id as Trait]) as [
          Trait,
          Trait | null,
        ]),
      );
      return update(r.ok ? ok : fail(r.reason));
    },
    finish() {
      const rs = reasons();
      if (rs.includes('statPoints')) return fail('points-unspent');
      if (rs.includes('tags')) return fail('tags-missing');
      if (rs.includes('name')) return fail('name-missing');
      deps.onFinish({ critter, name: name.trim(), age, gender, presetId });
      return ok;
    },
  };

  return { view: store, commands, critter: () => critter };
}
