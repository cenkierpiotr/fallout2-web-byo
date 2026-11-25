import { describe, expect, it, vi } from 'vitest';
import {
  ItemType,
  Stat,
  TimedEffectQueue,
  addItem,
  defaultRulesContext,
  newCritterData,
  newGameObject,
  recalcDerived,
  setStatBase,
  type GameObject,
  type ItemProto,
  type ItemUseContext,
} from '../../rules/src/index.js';
import type { InventoryCommands } from '../../ui/src/screens/inventory/types.js';
import { createInventoryBinding } from '../src/inventory-binding.js';

const base = { size: 1, weight: 1, cost: 10, flags: 0, flagsExt: 0 };
const PROTOS = new Map<number, ItemProto>();
const add = (p: ItemProto): void => void PROTOS.set(p.pid, p);
add({ ...base, pid: 1, type: ItemType.Weapon, weight: 5, caliber: 1, maxAmmo: 30, ammoPid: 2 });
add({ ...base, pid: 2, type: ItemType.Ammo, weight: 2, caliber: 1, quantityPerStack: 20 });
add({
  ...base,
  pid: 3,
  type: ItemType.Armor,
  weight: 20,
  armorClass: 10,
  damageResistance: [20, 0, 0, 0, 0, 0, 0],
  damageThreshold: [4, 0, 0, 0, 0, 0, 0],
  perk: -1,
});
add({ ...base, pid: 6, type: ItemType.Container, weight: 3, maxSize: 10 });
add({ ...base, pid: 7, type: ItemType.Misc, weight: 60, size: 6 });
add({
  ...base,
  pid: 40,
  type: ItemType.Drug,
  statId: [35, -1, -1],
  instantAmount: [10, 0, 0],
  duration1: 0,
  delayed1Amount: [0, 0, 0],
  duration2: 0,
  delayed2Amount: [0, 0, 0],
  addictionChance: 0,
  withdrawalEffect: 0,
  withdrawalOnset: 0,
});

function setup() {
  let nextId = 100;
  const critter = newCritterData(true);
  for (let s = 0; s < 7; s++) setStatBase(critter, s, 5);
  recalcDerived(critter);
  critter.curHP = 10;
  const player = newGameObject(1, 16777216, critter);
  const ctx = (): ItemUseContext => ({
    ...defaultRulesContext(),
    protos: (pid) => PROTOS.get(pid),
    allocId: () => nextId++,
    effects: queue,
  });
  const queue = new TimedEffectQueue();
  const onDrop = vi.fn();
  const onChange = vi.fn();
  const b = createInventoryBinding({
    player,
    itemsContext: ctx,
    itemMeta: (pid) => ({ name: `item${pid}`, fid: pid + 1000 }),
    paperdollFid: (armorPid) => (armorPid === null ? 1 : 2),
    onDrop,
    onChange,
  });
  const give = (pid: number, count = 1, rounds = 0): GameObject => {
    const o = newGameObject(nextId++, pid);
    o.rounds = rounds;
    expect(addItem(player, o, count, ctx()).ok).toBe(true);
    b.refresh();
    return o;
  };
  return { b, player, critter, give, onDrop, onChange, ctx };
}

describe('inventory-binding', () => {
  it('widok: pozycje, waga, limit, sloty puste', () => {
    const { b, give } = setup();
    give(7);
    const v = b.inventory.value;
    expect(v.items).toHaveLength(1);
    expect(v.items[0]).toMatchObject({
      pid: 7,
      name: 'item7',
      fid: 1007,
      category: 'misc',
      count: 1,
      weight: 60,
      value: 10,
      usable: false,
    });
    expect(v.weight).toBe(60);
    expect(v.weightMax).toBe(150); // 25 + 25 * ST5
    expect(v.slots).toEqual({ left: null, right: null, armor: null });
    expect(v.paperdollFid).toBe(1);
  });

  it('equip odzwierciedla slot, unequip zwraca do plecaka, pancerz zmienia paperdoll i AC', () => {
    const { b, give, critter } = setup();
    const armor = give(3);
    const cmd: InventoryCommands = b.commands;
    expect(cmd.equip(armor.id, 'armor')).toEqual({ ok: true });
    expect(b.inventory.value.slots.armor?.pid).toBe(3);
    expect(b.inventory.value.items.find((i) => i.pid === 3)).toBeUndefined();
    expect(b.inventory.value.slots.armor?.stats).toMatchObject({ dt: 4, dr: 20 });
    expect(b.inventory.value.paperdollFid).toBe(2);
    expect(critter.bonusStats[Stat.ArmorClass]).toBe(10);
    expect(cmd.unequip('armor')).toEqual({ ok: true });
    expect(b.inventory.value.slots.armor).toBeNull();
    expect(b.inventory.value.items.find((i) => i.pid === 3)).toBeDefined();
    expect(critter.bonusStats[Stat.ArmorClass]).toBe(0);
  });

  it('equip w zlym slocie zwraca blad', () => {
    const { b, give } = setup();
    const armor = give(3);
    expect(b.commands.equip(armor.id, 'left')).toEqual({ ok: false, reason: 'wrong-slot' });
    expect(b.commands.equip(9999, 'left')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('use stimpak leczy i zuzywa', () => {
    const { b, give, critter } = setup();
    const st = give(40, 2);
    expect(b.inventory.value.items[0]?.usable).toBe(true);
    expect(b.commands.use(st.id)).toEqual({ ok: true });
    expect(critter.curHP).toBe(20);
    expect(b.inventory.value.items[0]?.count).toBe(1);
    expect(b.commands.use(7777)).toEqual({ ok: false, reason: 'not-found' });
  });

  it('use przedmiotu nieuzywalnego zwraca blad', () => {
    const { b, give } = setup();
    const m = give(7);
    expect(b.commands.use(m.id)).toEqual({ ok: false, reason: 'not-usable' });
  });

  it('amunicja: count = naboje', () => {
    const { b, give } = setup();
    give(2, 15, 15);
    const it = b.inventory.value.items.find((i) => i.pid === 2);
    expect(it?.count).toBe(15);
    expect(it?.category).toBe('ammo');
  });

  it('drop usuwa z inwentarza i wola onDrop', () => {
    const { b, give, onDrop, player } = setup();
    const m = give(7, 3);
    expect(b.commands.drop(m.id, 2)).toEqual({ ok: true });
    expect(player.inventory[0]?.count).toBe(1);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop.mock.calls[0]?.[1]).toBe(2);
    expect(b.commands.drop(m.id, 5)).toMatchObject({ ok: false });
  });

  it('kontener: open, move w obie strony, takeAll, close', () => {
    const { b, give, ctx } = setup();
    const m = give(7);
    const chest = newGameObject(500, 6);
    const loot = newGameObject(501, 40);
    expect(addItem(chest, loot, 3, ctx()).ok).toBe(true);
    expect(b.commands.takeAll()).toEqual({ ok: false, reason: 'no-container' });
    b.openContainer(chest, 'Skrzynia');
    expect(b.container.value).toMatchObject({ id: 500, name: 'Skrzynia' });
    expect(b.container.value?.items[0]?.count).toBe(3);
    expect(b.commands.move(m.id, 1, 'container')).toEqual({ ok: true });
    expect(b.container.value?.items).toHaveLength(2);
    expect(b.inventory.value.items).toHaveLength(0);
    expect(b.commands.move(loot.id, 1, 'player')).toEqual({ ok: true });
    expect(b.inventory.value.items[0]?.count).toBe(1);
    expect(b.commands.takeAll()).toEqual({ ok: true });
    expect(b.container.value?.items).toHaveLength(0);
    expect(b.inventory.value.items.length).toBeGreaterThan(0);
    b.commands.closeContainer();
    expect(b.container.value).toBeNull();
  });

  it('move do pelnego kontenera nie zmienia stanu (atomowo)', () => {
    const { b, give, player, ctx } = setup();
    const big = give(7, 2); // rozmiar 6 x 2 = 12 > maxSize 10
    const chest = newGameObject(500, 6);
    b.openContainer(chest, 'S');
    const r = b.commands.move(big.id, 2, 'container');
    expect(r.ok).toBe(false);
    expect(player.inventory[0]?.count).toBe(2);
    expect(chest.inventory).toHaveLength(0);
    void ctx;
  });

  it('onChange wolane po zmianie', () => {
    const { b, give, onChange } = setup();
    const m = give(7);
    onChange.mockClear();
    b.commands.drop(m.id, 1);
    expect(onChange).toHaveBeenCalled();
  });
});
