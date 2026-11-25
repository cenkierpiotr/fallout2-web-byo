import { describe, expect, it, vi } from 'vitest';
import {
  GameClock,
  MovementSystem,
  createGameView,
  indexObject,
  type GameMap,
  type GameObject,
  type World,
} from '@f2/engine-core';
import { createWorldInventory, carryMax, REACH_RANGE } from './inventory-world';
import { defaultSheet, FLAG_LEFT_HAND, FLAG_RIGHT_HAND, FLAG_WORN } from './save-world';

let nid = 1;
function item(
  subtype: number,
  over: { pid?: number; qty?: number; weight?: number; data?: number[]; hex?: number } = {},
): GameObject {
  const pid = over.pid ?? 100 + nid;
  return {
    id: nid++,
    pid,
    fid: 0,
    type: 0,
    hex: over.hex ?? -1,
    elevation: 0,
    rotation: 0,
    frame: 0,
    flags: 0,
    protoFlags: 0,
    scriptId: -1,
    localVars: new Int32Array(0),
    inventory: [],
    quantity: over.qty ?? 1,
    proto: {
      kind: 'item',
      pid,
      subtype,
      weight: over.weight ?? 2,
      cost: 10,
      invFid: 0x7000001,
      data: over.data ?? [],
      size: 1,
    } as never,
    extra: { kind: 'item', subtype, flags: 0, raw: new Int32Array(0) },
    hidden: false,
  };
}
function critter(hex: number): GameObject {
  return {
    id: nid++,
    pid: 0x01000000,
    fid: 0x01000000,
    type: 1,
    hex,
    elevation: 0,
    rotation: 0,
    frame: 0,
    flags: 0,
    protoFlags: 0,
    scriptId: -1,
    localVars: new Int32Array(0),
    inventory: [],
    proto: undefined as never,
    extra: { kind: 'critter', flags: 0, raw: new Int32Array(10) },
    hidden: false,
  };
}
function setup() {
  const map = {
    name: 'T',
    header: {} as never,
    tiles: [],
    objects: [] as GameObject[],
    byHex: new Map(),
    globalVars: new Int32Array(0),
    localVars: new Int32Array(0),
    scripts: [],
    exitGrids: [],
  } as unknown as GameMap;
  const player = critter(20100);
  map.objects.push(player);
  indexObject(map, player);
  const world = {
    map,
    player,
    clock: new GameClock(0),
    movement: new MovementSystem(map),
    loader: {} as never,
    view: createGameView(),
  } as World;
  const sheet = defaultSheet();
  sheet.baseStats[0] = 5; // ST 5 => udzwig 150
  sheet.baseStats[7] = 30;
  sheet.hp = 10;
  const onChange = vi.fn();
  const inv = createWorldInventory({ world, sheet: () => sheet, allocId: () => nid++, onChange });
  return { map, player, sheet, inv, onChange };
}
const place = (map: GameMap, o: GameObject, hex: number) => {
  o.hex = hex;
  map.objects.push(o);
  indexObject(map, o);
};

describe('inventory-world', () => {
  it('udzwig 25 + 25*ST + bonus', () => {
    const s = defaultSheet();
    s.baseStats[0] = 6;
    s.statBonuses[12] = 10;
    expect(carryMax(s)).toBe(185);
  });

  it('podnoszenie z ziemi: zasieg, scalanie stosow, udzwig', () => {
    const { map, player, inv } = setup();
    const a = item(5, { pid: 77, qty: 3, weight: 1, hex: 20101 });
    place(map, a, 20101);
    expect(inv.pickup(a)).toEqual({ ok: true });
    expect(player.inventory).toHaveLength(1);
    expect(map.objects).not.toContain(a);
    const b = item(5, { pid: 77, qty: 2, weight: 1 });
    place(map, b, 20102);
    inv.pickup(b);
    expect(player.inventory).toHaveLength(1);
    expect(player.inventory[0]!.quantity).toBe(5);
    const far = item(5, { hex: 20100 + 40 });
    place(map, far, 20100 + 40);
    expect(inv.pickup(far)).toEqual({ ok: false, reason: 'too-far' });
    const heavy = item(5, { weight: 500 });
    place(map, heavy, 20101);
    expect(inv.pickup(heavy)).toEqual({ ok: false, reason: 'too-heavy' });
    expect(REACH_RANGE).toBeGreaterThan(0);
    expect(inv.inventory.value.weight).toBe(5);
    expect(inv.inventory.value.weightMax).toBe(150);
  });

  it('zakladanie: bron do reki, pancerz do slotu pancerza, stos dzieli sie na jedna sztuke', () => {
    const { player, inv } = setup();
    const gun = item(3, { data: [0, 3, 8, 0, 20] });
    const armor = item(0, { data: [0, 25, 0, 0, 0, 0, 0, 0, 4] });
    const stim = item(2, { pid: 40, qty: 3 });
    player.inventory.push(gun, armor, stim);
    inv.refresh();
    expect(inv.commands.equip(gun.id, 'right')).toEqual({ ok: true });
    expect(gun.flags & FLAG_RIGHT_HAND).toBeTruthy();
    expect(inv.commands.equip(armor.id, 'right')).toEqual({ ok: false, reason: 'wrong-slot' });
    expect(inv.commands.equip(gun.id, 'armor')).toEqual({ ok: false, reason: 'not-found' });
    expect(inv.commands.equip(armor.id, 'armor').ok).toBe(true);
    expect(armor.flags & FLAG_WORN).toBeTruthy();
    expect(inv.commands.equip(stim.id, 'left').ok).toBe(true);
    expect(player.inventory.find((x) => x.flags & FLAG_LEFT_HAND)!.quantity).toBe(1);
    expect(stim.quantity).toBe(2);
    const v = inv.inventory.value;
    expect(v.slots.right?.stats).toEqual({ damageMin: 3, damageMax: 8, range: 20 });
    expect(v.slots.armor?.stats).toEqual({ dr: 25, dt: 4 });
    expect(v.items.map((x) => x.id)).toEqual([stim.id]);
    // druga bron w tym samym slocie wypiera pierwsza
    const gun2 = item(3);
    player.inventory.push(gun2);
    inv.commands.equip(gun2.id, 'right');
    expect(gun.flags & FLAG_RIGHT_HAND).toBe(0);
    expect(inv.commands.unequip('right').ok).toBe(true);
    expect(inv.commands.unequip('right')).toEqual({ ok: false, reason: 'empty-slot' });
  });

  it('upuszczanie na ziemie: czesc stosu laduje pod graczem', () => {
    const { player, map, inv } = setup();
    const ammo = item(4, { pid: 29, qty: 10, weight: 0 });
    player.inventory.push(ammo);
    inv.refresh();
    expect(inv.commands.drop(ammo.id, 4)).toEqual({ ok: true });
    expect(ammo.quantity).toBe(6);
    const dropped = map.objects.find((o) => o.pid === 29 && o !== ammo)!;
    expect(dropped.quantity).toBe(4);
    expect(dropped.hex).toBe(player.hex);
    expect(inv.commands.drop(ammo.id, 99)).toEqual({ ok: true });
    expect(player.inventory).toHaveLength(0);
    expect(inv.commands.drop(ammo.id, 1)).toEqual({ ok: false, reason: 'not-found' });
  });

  it('uzycie leku: leczenie ograniczone do maksimum, sztuka zuzyta, nie-lek odrzucony', () => {
    const { player, sheet, inv } = setup();
    const stim = item(2, { pid: 40, qty: 2, data: [35, -1, -1, 12, 0, 0] });
    const junk = item(5);
    player.inventory.push(stim, junk);
    expect(inv.commands.use(stim.id)).toEqual({ ok: true });
    expect(sheet.hp).toBe(22);
    expect(stim.quantity).toBe(1);
    inv.commands.use(stim.id);
    expect(sheet.hp).toBe(30);
    expect(player.inventory).not.toContain(stim);
    expect(inv.commands.use(junk.id)).toEqual({ ok: false, reason: 'not-usable' });
  });

  it('useDrug: odmowa nie zuzywa sztuki, zgoda zuzywa jedna', () => {
    const { map, player, sheet } = setup();
    const w = { map, player } as never;
    let allow = false;
    const inv2 = createWorldInventory({
      world: w,
      sheet: () => sheet,
      allocId: () => nid++,
      useDrug: () => (allow ? { ok: true, consumed: true } : { ok: false, reason: 'no-ap' }),
    });
    const stim = item(2, { pid: 40, qty: 2, data: [35, -1, -1, 12, 0, 0] });
    player.inventory.push(stim);
    expect(inv2.commands.use(stim.id)).toEqual({ ok: false, reason: 'no-ap' });
    expect(stim.quantity).toBe(2);
    expect(sheet.hp).toBe(10);
    allow = true;
    expect(inv2.commands.use(stim.id)).toEqual({ ok: true });
    expect(stim.quantity).toBe(1);
  });

  it('pojemnik: otwarcie wymaga zasiegu, przenoszenie, limit udzwigu, wez wszystko', () => {
    const { player, map, inv, onChange } = setup();
    const chest = item(1, { hex: 20102 });
    place(map, chest, 20102);
    const knife = item(3, { weight: 3 });
    const rock = item(5, { weight: 500 });
    chest.inventory.push(knife, rock);
    const farChest = item(1);
    place(map, farChest, 20100 + 50);
    expect(inv.openContainer(farChest)).toEqual({ ok: false, reason: 'too-far' });
    expect(inv.openContainer(item(5))).toEqual({ ok: false, reason: 'not-container' });
    expect(inv.openContainer(chest)).toEqual({ ok: true });
    expect(inv.container.value?.items).toHaveLength(2);
    expect(inv.commands.move(rock.id, 1, 'player')).toEqual({ ok: false, reason: 'too-heavy' });
    expect(inv.commands.move(knife.id, 1, 'player')).toEqual({ ok: true });
    expect(player.inventory).toContain(knife);
    expect(inv.commands.move(knife.id, 1, 'container')).toEqual({ ok: true });
    expect(chest.inventory).toContain(knife);
    expect(inv.commands.takeAll()).toEqual({ ok: false, reason: 'too-heavy' });
    expect(chest.inventory).toEqual([rock]);
    inv.commands.closeContainer();
    expect(inv.container.value).toBeNull();
    expect(inv.commands.move(knife.id, 1, 'player')).toEqual({ ok: false, reason: 'no-container' });
    expect(onChange).toHaveBeenCalled();
  });
});
