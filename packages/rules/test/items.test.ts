import { describe, expect, it } from 'vitest';
import {
  DRUG_TABLE,
  ItemType,
  Slot,
  Stat,
  TimedEffectQueue,
  addItem,
  applyTimedEffect,
  canCarry,
  checkAddiction,
  defaultRulesContext,
  equip,
  isOverloaded,
  itemWeight,
  moveItem,
  newCritterData,
  newGameObject,
  readBook,
  recalcDerived,
  removeItem,
  statLevel,
  takeAll,
  takeDrug,
  toggledItemPid,
  totalWeight,
  unequip,
  useItem,
  type DrugProto,
  type GameObject,
  type ItemProto,
  type ItemUseContext,
} from '../src/index.js';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const base = { size: 1, weight: 1, cost: 10, flags: 0, flagsExt: 0 };
const NONE3: [number, number, number] = [0, 0, 0];
const drug = (o: Partial<DrugProto> & { pid: number }): DrugProto => ({
  ...base,
  type: ItemType.Drug,
  statId: [-1, -1, -1],
  instantAmount: NONE3,
  duration1: 0,
  delayed1Amount: NONE3,
  duration2: 0,
  delayed2Amount: NONE3,
  addictionChance: 0,
  withdrawalEffect: 0,
  withdrawalOnset: 0,
  ...o,
});

const PROTOS = new Map<number, ItemProto>();
const add = (p: ItemProto): ItemProto => (PROTOS.set(p.pid, p), p);
add({ ...base, pid: 1, type: ItemType.Weapon, weight: 5, caliber: 1, maxAmmo: 30, ammoPid: 2 });
add({ ...base, pid: 2, type: ItemType.Ammo, weight: 2, size: 1, caliber: 1, quantityPerStack: 20 });
add({
  ...base,
  pid: 3,
  type: ItemType.Armor,
  weight: 20,
  armorClass: 10,
  damageResistance: [20, 10, 0, 0, 0, 0, 0],
  damageThreshold: [4, 2, 0, 0, 0, 0, 0],
  perk: -1,
});
add({
  ...base,
  pid: 4,
  type: ItemType.Weapon,
  weight: 12,
  flagsExt: 0x200,
  caliber: 2,
  maxAmmo: 5,
  ammoPid: -1,
});
add({ ...base, pid: 5, type: ItemType.Weapon, weight: 3, caliber: 0, maxAmmo: 0, ammoPid: -1 });
add({ ...base, pid: 6, type: ItemType.Container, size: 1, weight: 3, maxSize: 10 });
add({ ...base, pid: 7, type: ItemType.Misc, weight: 60, size: 6 });
add({ ...base, pid: 8, type: ItemType.Misc, weight: 40, size: 3 });
add(drug({ pid: 40, statId: [35, -1, -1], instantAmount: [10, 0, 0] })); // stimpak
add(
  drug({
    pid: 144,
    statId: [35, -1, -1],
    instantAmount: [75, 0, 0],
    duration1: 12,
    delayed1Amount: [-5, 0, 0],
  }),
); // super stimpak
add(
  drug({
    pid: 87,
    statId: [0, -1, -1],
    instantAmount: [2, 0, 0],
    duration1: 240,
    delayed1Amount: [-2, 0, 0],
    addictionChance: 25,
    withdrawalOnset: 3,
  }),
); // Buffout
add(add({ ...base, pid: 73, type: ItemType.Misc }));

let nextId = 1;
function ctxWith(seed = 42): ItemUseContext & { effects: TimedEffectQueue } {
  const r = mulberry32(seed);
  return {
    ...defaultRulesContext(),
    rng: { int: (lo, hi) => lo + Math.floor(r() * (hi - lo + 1)) },
    protos: (pid) => PROTOS.get(pid),
    allocId: () => 5000 + nextId++,
    effects: new TimedEffectQueue(),
  };
}
const ctx0 = ctxWith();

function critter(st = 5, id = 100): GameObject {
  const c = newCritterData(true);
  c.baseStats[0] = st;
  recalcDerived(c, ctx0);
  c.curHP = statLevel(c, Stat.MaxHitPoints, ctx0);
  return newGameObject(id, 0x1000000, c);
}
const obj = (pid: number): GameObject => newGameObject(nextId++, pid);
const summary = (o: GameObject): unknown =>
  o.inventory.map((e) => [e.obj.id, e.count, e.obj.rounds, e.obj.owner?.id ?? null]);

describe('waga i dodawanie', () => {
  it('itemWeight includes loaded ammo', () => {
    const gun = obj(1);
    gun.rounds = 25;
    gun.ammoPid = 2;
    expect(itemWeight(gun, ctx0.protos)).toBe(5 + 2 * 2); // ((25-1)/20+1)=2 stosy po 2
    gun.rounds = 0;
    expect(itemWeight(gun, ctx0.protos)).toBe(5);
  });

  it('pancerz wspomagany (pid 3) waży połowę, bez zawartości; ukryty przedmiot waży 0', () => {
    const armor = obj(3);
    expect(itemWeight(armor, ctx0.protos)).toBe(10);
    armor.inventory.push({ obj: obj(1), count: 1 });
    expect(itemWeight(armor, ctx0.protos)).toBe(10);
    const hidden: ItemProto = { ...(ctx0.protos(1) as ItemProto), pid: 9001, flagsExt: 0x8000000 };
    expect(itemWeight(obj(9001), (pid) => (pid === 9001 ? hidden : ctx0.protos(pid)))).toBe(0);
  });

  it('toggledItemPid: Geiger i Stealth Boy w obie strony', () => {
    expect(toggledItemPid(0x34)).toBe(0xcf);
    expect(toggledItemPid(0xcf)).toBe(0x34);
    expect(toggledItemPid(0x36)).toBe(0xd2);
    expect(toggledItemPid(0xd2)).toBe(0x36);
    expect(toggledItemPid(0x35)).toBeUndefined();
  });

  it('isOverloaded: udzwig mniejszy niz waga', () => {
    expect(isOverloaded(50, 51)).toBe(true);
    expect(isOverloaded(50, 50)).toBe(false);
  });

  it('addItem przekraczajacy udzwig przechodzi (kara, nie blokada); canCarry z enforceWeight odrzuca', () => {
    const c = critter(1); // limit 50
    expect(addItem(c, obj(8), 1, ctx0)).toEqual({ ok: true });
    const heavy = obj(7);
    expect(canCarry(c, heavy, 1, ctx0, { enforceWeight: true })).toEqual({
      ok: false,
      reason: 'too-heavy',
    });
    expect(addItem(c, heavy, 1, ctx0)).toEqual({ ok: true });
    expect(c.critter!.carriedWeight).toBe(100);
  });

  it('ammo stacks fill to quantityPerStack (15+15 -> 20+10), remove 5 from 20 -> 15', () => {
    const c = critter(10);
    expect(addItem(c, obj(2), 15, ctx0).ok).toBe(true);
    expect(addItem(c, obj(2), 15, ctx0).ok).toBe(true);
    expect(c.inventory.map((e) => e.obj.rounds)).toEqual([20, 10]);
    const first = c.inventory[0]!.obj;
    expect(removeItem(c, first, 5, ctx0)).toEqual({ ok: true });
    expect(first.rounds).toBe(15);
    expect(removeItem(c, first, 15, ctx0)).toEqual({ ok: true });
    expect(first.owner).toBeNull();
    expect(removeItem(c, first, 1, ctx0)).toEqual({ ok: false, reason: 'not-in-inventory' });
  });

  it('identical items stack and owner is cleared on remove', () => {
    const c = critter(10);
    const a = obj(5);
    addItem(c, a, 2, ctx0);
    addItem(c, obj(5), 3, ctx0);
    expect(c.inventory).toHaveLength(1);
    expect(c.inventory[0]!.count).toBe(5);
    expect(totalWeight(c, ctx0.protos)).toBe(15);
    removeItem(c, a, 5, ctx0);
    expect(a.owner).toBeNull();
    expect(c.critter!.carriedWeight).toBe(0);
  });
});

describe('przenoszenie', () => {
  it('moveItem atomic when target full', () => {
    const chest = obj(6); // maxSize 10
    const c = critter(10);
    const a = obj(5);
    a.id = 900;
    addItem(c, a, 12, ctx0); // size 12 > 10
    const fromBefore = JSON.stringify(summary(c));
    expect(moveItem(c, chest, a, 12, ctx0)).toEqual({ ok: false, reason: 'container-full' });
    expect(JSON.stringify(summary(c))).toBe(fromBefore);
    expect(chest.inventory).toHaveLength(0);
    expect(moveItem(c, chest, a, 4, ctx0)).toEqual({ ok: true });
    expect(c.inventory[0]!.count).toBe(8);
    expect(chest.inventory[0]!.count).toBe(4);
    expect(c.critter!.carriedWeight).toBe(24);
  });

  it('takeAll moves until container size limit', () => {
    const src = obj(6);
    addItem(src, obj(7), 1, ctx0); // size 6
    addItem(src, obj(8), 1, ctx0); // size 3
    const dst = obj(6); // maxSize 10, zajete 3: pozycja rozmiaru 6 wchodzi (9), rozmiaru 3 juz nie (12)
    addItem(dst, obj(8), 1, ctx0); // 3
    const r = takeAll(src, dst, ctx0);
    expect(r.moved).toBe(1);
    expect(r.blocked).toEqual([{ ok: false, reason: 'container-full' }]);
    expect(dst.inventory.map((e) => e.obj.pid)).toEqual([8, 7]);
    expect(src.inventory.map((e) => e.obj.pid)).toEqual([8]);
  });
});

describe('ekwipunek', () => {
  it('equip armor updates AC and DT/DR via statLevel', () => {
    const c = critter(5);
    const ac0 = statLevel(c.critter!, Stat.ArmorClass, ctx0);
    const armor = obj(3);
    addItem(c, armor, 1, ctx0);
    expect(equip(c, armor, Slot.LeftHand, ctx0)).toEqual({ ok: false, reason: 'wrong-slot' });
    expect(equip(c, armor, Slot.Armor, ctx0)).toEqual({ ok: true });
    const cr = c.critter!;
    expect(statLevel(cr, Stat.ArmorClass, ctx0)).toBe(ac0 + 10);
    expect(statLevel(cr, Stat.DrNormal, ctx0)).toBe(20);
    expect(statLevel(cr, Stat.DtNormal, ctx0)).toBe(4);
    expect(statLevel(cr, Stat.DtLaser, ctx0)).toBe(2);
    expect(unequip(c, Slot.Armor, ctx0)).toEqual({ ok: true });
    expect(statLevel(cr, Stat.ArmorClass, ctx0)).toBe(ac0);
    expect(statLevel(cr, Stat.DrNormal, ctx0)).toBe(0);
    expect(unequip(c, Slot.Armor, ctx0)).toEqual({ ok: false, reason: 'slot-empty' });
  });

  it('two-handed weapon blocks second hand', () => {
    const c = critter(10);
    const rifle = obj(4);
    const knife = obj(5);
    addItem(c, rifle, 1, ctx0);
    addItem(c, knife, 1, ctx0);
    expect(equip(c, knife, Slot.RightHand, ctx0)).toEqual({ ok: true });
    expect(c.critter!.hasRealWeaponInHand).toBe(true);
    expect(equip(c, rifle, Slot.LeftHand, ctx0)).toEqual({
      ok: false,
      reason: 'two-handed-conflict',
    });
    unequip(c, Slot.RightHand, ctx0);
    expect(equip(c, rifle, Slot.LeftHand, ctx0)).toEqual({ ok: true });
    expect(equip(c, knife, Slot.RightHand, ctx0)).toEqual({
      ok: false,
      reason: 'two-handed-conflict',
    });
    expect(c.critter!.heldItemPids).toEqual([4]);
  });

  it('removing an equipped item reverts its bonuses', () => {
    const c = critter(5);
    const armor = obj(3);
    addItem(c, armor, 1, ctx0);
    equip(c, armor, Slot.Armor, ctx0);
    removeItem(c, armor, 1, ctx0);
    expect(c.equipped[Slot.Armor]).toBeNull();
    expect(c.critter!.bonusStats[Stat.ArmorClass]).toBe(0);
  });
});

describe('uzycie i efekty czasowe', () => {
  it('stimpak heals amount from proto and is consumed', () => {
    const ctx = ctxWith();
    const c = critter(5);
    c.critter!.curHP = 5;
    const st = obj(40);
    addItem(c, st, 1, ctx);
    const r = useItem(c, st, null, ctx);
    expect(r).toMatchObject({ ok: true, consumed: true, effects: [{ stat: 35, amount: 10 }] });
    expect(c.critter!.curHP).toBe(15);
    expect(c.inventory).toHaveLength(0);
  });

  it('super stimpak applies delayed damage via timed effect', () => {
    const ctx = ctxWith();
    const c = critter(5);
    c.critter!.curHP = 1;
    const r = takeDrug(c, PROTOS.get(144) as DrugProto, ctx);
    expect(r.ok).toBe(true);
    expect(c.critter!.curHP).toBe(30); // clamp do maxHP
    expect(ctx.effects.due(12 * 600 - 1)).toEqual([]);
    const due = ctx.effects.due(12 * 600);
    expect(due).toHaveLength(1);
    applyTimedEffect(c, due[0]!, ctx);
    expect(c.critter!.curHP).toBe(25);
  });

  it('Buffout raises ST now and reverts after duration', () => {
    const ctx = ctxWith();
    const c = critter(5);
    takeDrug(c, PROTOS.get(87) as DrugProto, ctx);
    expect(statLevel(c.critter!, Stat.Strength, ctx)).toBe(7);
    expect(ctx.effects.due(240 * 600 - 1).filter((e) => e.kind === 'drug-stage')).toEqual([]);
    const due = ctx.effects.due(240 * 600).filter((e) => e.kind === 'drug-stage');
    expect(due).toHaveLength(1);
    applyTimedEffect(c, due[0]!, ctx);
    expect(statLevel(c.critter!, Stat.Strength, ctx)).toBe(5);
  });

  it('Buffout limit of 4 blocks the fifth use (overdose)', () => {
    const ctx = ctxWith();
    ctx.rng = { int: (_lo, hi) => hi }; // brak uzaleznienia
    const c = critter(5);
    const p = PROTOS.get(87) as DrugProto;
    for (let i = 0; i < 4; i++) expect(takeDrug(c, p, ctx).effects?.length).toBeGreaterThan(0);
    const fifth = takeDrug(c, p, ctx);
    expect(fifth).toMatchObject({ ok: true, reason: 'overdose' });
    expect(fifth.effects).toBeUndefined();
    expect(c.critter!.bonusStats[0]).toBe(8);
  });

  it('timed effects serialize and restore equal', () => {
    const ctx = ctxWith();
    const c = critter(5);
    takeDrug(c, PROTOS.get(87) as DrugProto, ctx);
    takeDrug(c, PROTOS.get(144) as DrugProto, ctx);
    const json = JSON.parse(JSON.stringify(ctx.effects.serialize())) as ReturnType<
      TimedEffectQueue['serialize']
    >;
    const q2 = new TimedEffectQueue();
    q2.restore(json);
    expect(q2.serialize()).toEqual(ctx.effects.serialize());
    expect(q2.due(1e9)).toEqual(ctx.effects.due(1e9));
    q2.restore(json);
    expect(q2.schedule({ ...json[0]!, atTick: 1 }).seq).toBeGreaterThan(
      Math.max(...json.map((e) => e.seq)),
    );
  });

  it('addiction roll with seeded rng', () => {
    const ctx = ctxWith(42);
    const c = critter(5);
    const p = PROTOS.get(87) as DrugProto; // szansa 25
    const res = checkAddiction(c, p, ctx);
    expect(res).toEqual({ addicted: false, chance: 25, roll: 61 }); // seed 42, pierwszy rzut 1..100
    expect(c.addictions[22]).toBeUndefined();
    expect(checkAddiction(critter(5), p, ctxWith(42)).roll).toBe(61);
  });

  it('addiction succeeds when roll <= chance and queues withdrawal; antidote clears it', () => {
    const ctx = ctxWith();
    ctx.rng = { int: (lo) => lo };
    const c = critter(5);
    const p = PROTOS.get(87) as DrugProto;
    expect(checkAddiction(c, p, ctx)).toEqual({ addicted: true, chance: 25, roll: 1 });
    expect(c.addictions[22]).toBe(true);
    expect(ctx.effects.pending().find((e) => e.kind === 'withdrawal')).toMatchObject({
      addictionIndex: 22,
      atTick: 3 * 600,
    });
    expect(checkAddiction(c, p, ctx)).toEqual({ addicted: false, chance: 0, roll: 0 });
    const antidote = drug({ pid: 260 });
    expect(takeDrug(c, antidote, ctx)).toMatchObject({ ok: true, consumed: true });
    expect(c.addictions).toEqual({});
    expect(ctx.effects.pending().filter((e) => e.kind === 'withdrawal')).toHaveLength(0);
  });

  it('Chem Reliant doubles and Chem Resistant halves the addiction chance', () => {
    const p = PROTOS.get(87) as DrugProto;
    const a = critter(5);
    a.critter!.traits = [11, -1];
    expect(checkAddiction(a, p, ctxWith()).chance).toBe(50);
    const b = critter(5);
    b.critter!.traits = [12, -1];
    expect(checkAddiction(b, p, ctxWith()).chance).toBe(12);
  });
});

describe('ksiazki i dane', () => {
  it('readBook caps at limit from data', () => {
    const c = critter(5);
    const book = PROTOS.get(73)!;
    const ctx = ctxWith();
    ctx.skillLevel = () => 50;
    expect(readBook(c, book, ctx)).toEqual({ skill: 12, gained: 5, minutes: 360 });
    ctx.skillLevel = () => 81;
    expect(readBook(c, book, ctx)?.gained).toBe(1);
    ctx.skillLevel = () => 91;
    expect(readBook(c, book, ctx)?.gained).toBe(0);
    ctx.skillLevel = () => 50;
    c.critter!.perkRanks[81] = 1;
    expect(readBook(c, book, ctx)?.gained).toBe(7);
    expect(readBook(c, PROTOS.get(5)!, ctx)).toBeNull();
  });

  it('DRUG_TABLE zawiera poprawne wpisy limitow i uzaleznien', () => {
    expect(DRUG_TABLE.length).toBeGreaterThan(0);
    for (const d of DRUG_TABLE) {
      expect(d.drugPid).toBeGreaterThan(0);
      expect(d.maxCount).toBeGreaterThanOrEqual(0);
    }
  });
});
