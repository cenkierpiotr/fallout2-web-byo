import { describe, expect, it } from 'vitest';
import {
  ItemType,
  Perk,
  Skill,
  Slot,
  Stat,
  TimedEffectQueue,
  addItem,
  applyTimedEffect,
  canCarry,
  checkAddiction,
  defaultRulesContext,
  equip,
  lockpickChance,
  newCritterData,
  newGameObject,
  newSkillState,
  recalcDerived,
  skillLevel,
  statLevel,
  takeDrug,
  unequip,
  useSkillOn,
  type DrugProto,
  type GameObject,
  type ItemProto,
  type ItemUseContext,
  type Rng,
  type SkillCritter,
  type SkillObject,
  type SkillUseContext,
} from '../src/index.js';

const base = { size: 1, weight: 1, cost: 10, flags: 0, flagsExt: 0 };
const PROTOS = new Map<number, ItemProto>();
const add = (p: ItemProto): ItemProto => (PROTOS.set(p.pid, p), p);
add({ ...base, pid: 1, type: ItemType.Misc, weight: 500, size: 2 });
add({ ...base, pid: 2, type: ItemType.Container, maxSize: 10 });
add({ ...base, pid: 3, type: ItemType.Misc, size: 4 });
add({
  ...base,
  pid: 4,
  type: ItemType.Ammo,
  size: 3,
  caliber: 1,
  quantityPerStack: 20,
});
add({
  ...base,
  pid: 5,
  type: ItemType.Armor,
  armorClass: 5,
  damageResistance: [0, 0, 0, 0, 0, 0, 0],
  damageThreshold: [0, 0, 0, 0, 0, 0, 0],
  perk: Perk.BuffoutAddiction,
});
const NONE3: [number, number, number] = [0, 0, 0];
const buffout: DrugProto = {
  ...base,
  pid: 87,
  type: ItemType.Drug,
  statId: [0, -1, -1],
  instantAmount: [2, 0, 0],
  duration1: 240,
  delayed1Amount: [-2, 0, 0],
  duration2: 0,
  delayed2Amount: NONE3,
  addictionChance: 25,
  withdrawalEffect: Perk.BuffoutAddiction,
  withdrawalOnset: 3,
};

let nextId = 1;
function ctxItems(rng?: Rng): ItemUseContext {
  return {
    ...defaultRulesContext(),
    ...(rng ? { rng } : {}),
    protos: (pid) => PROTOS.get(pid),
    allocId: () => 9000 + nextId++,
    effects: new TimedEffectQueue(),
  };
}

function holder(player = true, st = 5): GameObject {
  const c = newCritterData(player);
  c.baseStats[0] = st;
  recalcDerived(c, defaultRulesContext());
  return newGameObject(nextId++, 0x1000000, c);
}
const obj = (pid: number): GameObject => newGameObject(nextId++, pid);

describe('waga a addItem (spec inventory.md: limit tylko rozmiar kontenera)', () => {
  it('addItem nie odrzuca przekroczenia udzwigu', () => {
    const c = holder(true, 1);
    const ctx = ctxItems();
    expect(addItem(c, obj(1), 1, ctx)).toEqual({ ok: true });
    expect(canCarry(c, obj(1), 1, ctx)).toEqual({ ok: true });
  });
  it('opcja enforceWeight przywraca twardy limit dla warstwy UI', () => {
    const c = holder(true, 1);
    expect(canCarry(c, obj(1), 1, ctxItems(), { enforceWeight: true })).toEqual({
      ok: false,
      reason: 'too-heavy',
    });
  });
});

describe('container-full', () => {
  it('addItem odrzuca ponad maxSize kontenera', () => {
    const chest = obj(2);
    const ctx = ctxItems();
    expect(addItem(chest, obj(3), 2, ctx)).toEqual({ ok: true }); // 8
    const x = obj(3);
    expect(addItem(chest, x, 1, ctx)).toEqual({ ok: false, reason: 'container-full' });
    expect(x.owner).toBeNull();
    expect(chest.inventory).toHaveLength(1);
  });
  it('rozmiar amunicji liczony za stos (spojnie z usedSize)', () => {
    const chest = obj(2);
    const ctx = ctxItems();
    // 45 nabojow = 3 stosy po 3 = 9 <= 10, ale 4 stosy (61..80) = 12 > 10
    expect(canCarry(chest, obj(4), 45, ctx)).toEqual({ ok: true });
    expect(canCarry(chest, obj(4), 61, ctx)).toEqual({ ok: false, reason: 'container-full' });
    expect(addItem(chest, obj(4), 45, ctx)).toEqual({ ok: true });
    expect(canCarry(chest, obj(3), 1, ctx)).toEqual({ ok: false, reason: 'container-full' });
  });
});

describe('perk pancerza przy equip', () => {
  it('equip stosuje perk, unequip i podmiana go zdejmuja', () => {
    const c = holder();
    const ctx = ctxItems();
    const armor = obj(5);
    addItem(c, armor, 1, ctx);
    const st0 = statLevel(c.critter!, Stat.Strength, ctx);
    expect(equip(c, armor, Slot.Armor, ctx)).toEqual({ ok: true });
    expect(statLevel(c.critter!, Stat.Strength, ctx)).toBe(st0 - 2);
    expect(c.critter!.perkRanks[Perk.BuffoutAddiction]).toBe(1);
    expect(unequip(c, Slot.Armor, ctx)).toEqual({ ok: true });
    expect(statLevel(c.critter!, Stat.Strength, ctx)).toBe(st0);
    expect(c.critter!.perkRanks[Perk.BuffoutAddiction] ?? 0).toBe(0);
    // ponowne zalozenie i usuniecie z inwentarza
    equip(c, armor, Slot.Armor, ctx);
    expect(statLevel(c.critter!, Stat.Strength, ctx)).toBe(st0 - 2);
  });
});

describe('odstawienie i uzaleznienie', () => {
  it('zdarzenie withdrawal stosuje efekt, antidotum go cofa', () => {
    const ctx = ctxItems({ int: (lo) => lo });
    const c = holder();
    const st0 = statLevel(c.critter!, Stat.Strength, ctx);
    checkAddiction(c, buffout, ctx);
    const ev = ctx.effects.pending().find((e) => e.kind === 'withdrawal')!;
    applyTimedEffect(c, ev, ctx);
    expect(statLevel(c.critter!, Stat.Strength, ctx)).toBe(st0 - 2);
    expect(c.critter!.perkRanks[Perk.BuffoutAddiction]).toBe(1);
    const antidote: DrugProto = {
      ...buffout,
      pid: 260,
      statId: [-1, -1, -1],
      delayed1Amount: NONE3,
    };
    takeDrug(c, antidote, ctx);
    expect(statLevel(c.critter!, Stat.Strength, ctx)).toBe(st0);
    expect(c.critter!.perkRanks[Perk.BuffoutAddiction] ?? 0).toBe(0);
  });
  it('flaga uzaleznienia tylko dla gracza', () => {
    const ctx = ctxItems({ int: (lo) => lo });
    const npc = holder(false);
    const r = checkAddiction(npc, buffout, ctx);
    expect(npc.addictions).toEqual({});
    expect(r.addicted).toBe(false);
    const pc = holder(true);
    expect(checkAddiction(pc, buffout, ctx).addicted).toBe(true);
    expect(pc.addictions[22]).toBe(true);
  });
});

function seq(values: number[]): Rng {
  let i = 0;
  return { int: (min) => values[i++] ?? min };
}
function skillCritter(player: boolean): SkillCritter {
  const c = newCritterData(player);
  for (let i = 0; i < 7; i++) c.baseStats[i] = 5;
  recalcDerived(c, defaultRulesContext());
  return Object.assign(c, newSkillState());
}
const sctx = (rng: Rng): SkillUseContext => ({
  ...defaultRulesContext(),
  rng,
  clock: { ticks: 1_000_000 },
});
const sobj = (id: number, c?: SkillCritter): SkillObject =>
  newGameObject(id, 0x1000000 + id, c) as SkillObject;

describe('Ghost bez swiatla', () => {
  it('brak playerLight = brak bonusu; swiatlo ciemne = +20', () => {
    const c = skillCritter(true);
    const ctx = sctx(seq([]));
    const s0 = skillLevel(c, Skill.Sneak, ctx);
    c.perkRanks[Perk.Ghost] = 1;
    expect(skillLevel(c, Skill.Sneak, ctx)).toBe(s0);
    expect(skillLevel(c, Skill.Sneak, { ...ctx, playerLight: 0x1000 })).toBe(s0 + 20);
    expect(skillLevel(c, Skill.Sneak, { ...ctx, playerLight: 0xffff })).toBe(s0);
  });
});

describe('XP za margines porazki (skille 9/10/11) i caught', () => {
  it('porazka locka daje xpPerUse + |margin|, tylko raz na obiekt', () => {
    const user = sobj(1, skillCritter(true));
    const lock = sobj(2);
    const chance = lockpickChance(user, lock, null, sctx(seq([])));
    const roll = Math.min(100, chance + 30);
    const margin = chance - roll; // ujemny, bez krytyka (rzut krytyka 100)
    const r = useSkillOn(user, Skill.Lockpick, lock, sctx(seq([roll, 100])));
    expect(r.ok).toBe(false);
    expect(r.xp).toBe(25 + Math.abs(margin));
    expect(useSkillOn(user, Skill.Lockpick, lock, sctx(seq([roll, 100]))).xp).toBe(0);
  });
  it('porazka skilla bez flagi marginesu (science) nie daje XP', () => {
    const user = sobj(1, skillCritter(true));
    const r = useSkillOn(user, Skill.Science, sobj(3), sctx(seq([100, 100])));
    expect(r.ok).toBe(false);
    expect(r.xp).toBe(0);
  });
  it('krytyczna porazka Steal emituje caught', () => {
    const user = sobj(1, skillCritter(true));
    const r = useSkillOn(user, Skill.Steal, sobj(4, skillCritter(false)), sctx(seq([100, 1])));
    expect(r.roll).toBe(0);
    expect(r.effects).toContainEqual({ kind: 'caught' });
  });
});
