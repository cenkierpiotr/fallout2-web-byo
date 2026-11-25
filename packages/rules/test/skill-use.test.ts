import { describe, expect, it } from 'vitest';
import {
  Perk,
  RollResult,
  Skill,
  Stat,
  Trait,
  defaultRulesContext,
  doctorHeal,
  firstAidHeal,
  lockpickChance,
  newCritterData,
  newGameObject,
  newSkillState,
  recalcDerived,
  rollCheck,
  skillLevel,
  skillUsesLeftToday,
  statLevel,
  sneakToggle,
  sneakCheck,
  useSkillOn,
  type Rng,
  type SkillCritter,
  type SkillObject,
  type SkillUseContext,
  pickPartyRoller,
} from '../src/index.js';

function seq(values: number[]): Rng {
  let i = 0;
  return { int: (min) => values[i++] ?? min };
}

function ctxWith(
  rng: Rng,
  ticks = 1_000_000,
  extra: Partial<SkillUseContext> = {},
): SkillUseContext {
  return { ...defaultRulesContext(), rng, clock: { ticks }, ...extra };
}

function critter(player: boolean, base = [5, 5, 5, 5, 5, 5, 5]): SkillCritter {
  const c = newCritterData(player);
  base.forEach((v, i) => (c.baseStats[i] = v));
  recalcDerived(c, defaultRulesContext());
  return Object.assign(c, newSkillState());
}

function obj(id: number, c?: SkillCritter, pid = 0x1000000 + id): SkillObject {
  return newGameObject(id, pid, c) as SkillObject;
}

describe('rollCheck thresholds', () => {
  it('failure when roll above chance', () => {
    expect(rollCheck(40, 0, seq([50]), false)).toBe(RollResult.Failure);
  });
  it('critical failure on bad margin', () => {
    // margin -50, crit roll 5 <= 5
    expect(rollCheck(40, 0, seq([90, 5]))).toBe(RollResult.CriticalFailure);
    expect(rollCheck(40, 0, seq([90, 6]))).toBe(RollResult.Failure);
  });
  it('success and critical success', () => {
    expect(rollCheck(60, 0, seq([60, 1]), false)).toBe(RollResult.Success);
    // margin 50 + critMod 3 => prog 8
    expect(rollCheck(60, 3, seq([10, 8]))).toBe(RollResult.CriticalSuccess);
    expect(rollCheck(60, 3, seq([10, 9]))).toBe(RollResult.Success);
  });
  it('no crits on first day', () => {
    expect(rollCheck(100, 100, seq([1, 1]), false)).toBe(RollResult.Success);
    expect(rollCheck(0, 0, seq([100, 1]), false)).toBe(RollResult.Failure);
  });
});

describe('skillLevel wiring of traits and perks', () => {
  it('Good Natured lowers combat skills and raises First Aid', () => {
    const c = critter(true);
    const ctx = ctxWith(seq([]));
    const sg = skillLevel(c, Skill.SmallGuns, ctx);
    const fa = skillLevel(c, Skill.FirstAid, ctx);
    c.traits = [Trait.GoodNatured, -1];
    expect(skillLevel(c, Skill.SmallGuns, ctx)).toBe(sg - 10);
    expect(skillLevel(c, Skill.FirstAid, ctx)).toBe(fa + 15);
  });
  it('perk skill bonus applies for the player only', () => {
    const p = critter(true);
    const n = critter(false);
    const ctx = ctxWith(seq([]));
    const p0 = skillLevel(p, Skill.FirstAid, ctx);
    const n0 = skillLevel(n, Skill.FirstAid, ctx);
    p.perkRanks[Perk.Medic] = 1;
    n.perkRanks[Perk.Medic] = 1;
    expect(skillLevel(p, Skill.FirstAid, ctx)).toBe(p0 + 10);
    expect(skillLevel(n, Skill.FirstAid, ctx)).toBe(n0);
  });
  it('Ghost depends on light', () => {
    const p = critter(true);
    p.perkRanks[Perk.Ghost] = 1;
    const dark = skillLevel(p, Skill.Sneak, { ...ctxWith(seq([])), playerLight: 0x1000 });
    const bright = skillLevel(p, Skill.Sneak, { ...ctxWith(seq([])), playerLight: 0xffff });
    expect(dark - bright).toBe(20);
  });
});

describe('lockpick', () => {
  it('tool has no engine bonus (exe 0x4aad08: lockpick roll comes from target script)', () => {
    const user = obj(1, critter(true));
    const lock = obj(2);
    const ctx = ctxWith(seq([]));
    const pick = obj(3, undefined, 84);
    expect(lockpickChance(user, lock, pick, ctx) - lockpickChance(user, lock, null, ctx)).toBe(0);
  });
  it('jams on critical failure and refuses further attempts', () => {
    const user = obj(1, critter(true));
    const lock = obj(2);
    lock.locked = true;
    const ctx = ctxWith(seq([100, 1]));
    const r = useSkillOn(user, Skill.Lockpick, lock, ctx);
    expect(r.ok).toBe(false);
    expect(r.roll).toBe(RollResult.CriticalFailure);
    expect(lock.jammed).toBe(true);
    expect(useSkillOn(user, Skill.Lockpick, lock, ctx).reason).toBe('jammed');
  });
  it('unlocks on success and awards xp once per object', () => {
    const user = obj(1, critter(true));
    const lock = obj(2);
    lock.locked = true;
    const ctx = ctxWith(seq([1, 100, 1, 100]));
    const a = useSkillOn(user, Skill.Lockpick, lock, ctx);
    expect(a.ok).toBe(true);
    expect(lock.locked).toBe(false);
    expect(a.xp).toBe(25);
    lock.locked = true;
    expect(useSkillOn(user, Skill.Lockpick, lock, ctxWith(seq([1, 100]))).xp).toBe(0);
    const t = obj(4);
    const first = useSkillOn(user, Skill.Traps, t, ctxWith(seq([1, 100, 1, 100])));
    expect(first.xp).toBe(25);
    const second = useSkillOn(user, Skill.Traps, t, ctxWith(seq([1, 100])));
    expect(second.ok).toBe(true);
    expect(second.xp).toBe(0);
  });
});

describe('first aid and doctor', () => {
  it('heals and consumes daily use; exhausted after 3', () => {
    const user = obj(1, critter(true, [5, 5, 5, 5, 5, 5, 5]));
    const target = obj(2, critter(false));
    const tc = target.critter!;
    tc.curHP = 1;
    const ctx = ctxWith({ int: (min) => min });
    expect(skillUsesLeftToday(user, Skill.FirstAid, ctx)).toBe(3);
    for (let i = 0; i < 3; i++) {
      const r = firstAidHeal(user, target, ctx);
      expect(r.ok).toBe(true);
      expect(r.effects[0]).toEqual({ kind: 'heal', amount: 1 });
    }
    expect(tc.curHP).toBe(4);
    const r4 = firstAidHeal(user, target, ctx);
    expect(r4.ok).toBe(false);
    expect(r4.reason).toBe('skill-exhausted');
    expect(skillUsesLeftToday(user, Skill.FirstAid, ctx)).toBe(0);
    const later = ctxWith({ int: (min) => min }, 1_000_000 + 900_000);
    expect(firstAidHeal(user, target, later).ok).toBe(true);
  });
  it('Healer adds dice, heal is clamped to missing HP', () => {
    const uc = critter(true);
    uc.perkRanks[Perk.Healer] = 2;
    const user = obj(1, uc);
    const target = obj(2, critter(false));
    const max = statLevel(target.critter!, Stat.MaxHitPoints, defaultRulesContext());
    target.critter!.curHP = max - 3;
    const r = firstAidHeal(user, target, ctxWith({ int: (mn, mx) => (mx === 100 ? mn : mx) }));
    expect(r.effects[0]).toEqual({ kind: 'heal', amount: 3 });
  });
  it('doctor also fixes crippled limbs', () => {
    const user = obj(1, critter(true));
    const target = obj(2, critter(false));
    target.critter!.curHP = 1;
    target.crippled = 0b101;
    const r = doctorHeal(user, target, ctxWith({ int: (min) => min }));
    expect(r.ok).toBe(true);
    expect(target.crippled).toBe(0);
    expect(r.effects.filter((e) => e.kind === 'uncripple')).toHaveLength(2);
  });
  it('no need when at full HP', () => {
    const user = obj(1, critter(true));
    const target = obj(2, critter(false));
    target.critter!.curHP = statLevel(target.critter!, Stat.MaxHitPoints, defaultRulesContext());
    expect(firstAidHeal(user, target, ctxWith(seq([]))).reason).toBe('no-need');
  });
});

describe('sneak', () => {
  it('success keeps 600 ticks, failure shortens by skill', () => {
    const user = obj(1, critter(true));
    const ok = sneakToggle(user, ctxWith(seq([1, 100])));
    expect(ok).toMatchObject({ sneaking: true, nextCheckTicks: 600 });
    const bad = sneakToggle(user, ctxWith(seq([100, 100])));
    expect(bad.sneaking).toBe(false);
    expect(bad.nextCheckTicks).toBe(600);
  });
});

describe('sneakCheck (0x42e32c)', () => {
  it('nie zmienia flagi skradania, zwraca wynik rzutu i opoznienie', () => {
    const user = obj(1, critter(true));
    user.sneaking = true;
    const r = sneakCheck(user, ctxWith(seq([100, 100])));
    expect(r.ok).toBe(false);
    expect(user.sneaking).toBe(true);
    expect(sneakCheck(user, ctxWith(seq([1, 100]))).ok).toBe(true);
  });
});

describe('script override', () => {
  it('skips default rule when hook returns true', () => {
    const user = obj(1, critter(true));
    const lock = obj(2);
    lock.locked = true;
    const ctx = ctxWith(seq([]), 1_000_000, { hooks: { useSkillOnProc: () => true } });
    const r = useSkillOn(user, Skill.Lockpick, lock, ctx);
    expect(r.overridden).toBe(true);
    expect(lock.locked).toBe(true);
  });
});

describe('pickPartyRoller (0x4aaaa4/0x495560/0x495520)', () => {
  const lv = (over: Record<number, number>): number[] =>
    Array.from({ length: 18 }, (_, i) => over[i] ?? 0);
  it('bierze czlonka z najwyzszym skillem, gdy to jego najlepszy skill', () => {
    const a = { member: 'a', hidden: false, isCritter: true, levels: lv({ 8: 40, 3: 30 }) };
    const b = { member: 'b', hidden: false, isCritter: true, levels: lv({ 8: 60 }) };
    expect(pickPartyRoller(8, [a, b])).toBe('b');
  });
  it('nie zastepuje, gdy skill nie jest najlepszym skillem zwyciezcy, dla Steal, ukrytych i pustych', () => {
    const b = { member: 'b', hidden: false, isCritter: true, levels: lv({ 8: 60, 3: 90 }) };
    expect(pickPartyRoller(8, [b])).toBeUndefined();
    expect(pickPartyRoller(10, [{ ...b, levels: lv({ 10: 99 }) }])).toBeUndefined();
    expect(pickPartyRoller(3, [{ ...b, hidden: true }])).toBeUndefined();
    expect(pickPartyRoller(3, [])).toBeUndefined();
  });
});
