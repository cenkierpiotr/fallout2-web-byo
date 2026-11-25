import { describe, expect, it } from 'vitest';
import {
  InventoryModel,
  PID_BOTTLE_CAPS,
  PartyScriptAdapter,
  PartyState,
  type GameObject,
} from '../index.js';
import { emptyMap, fake, put } from './helpers.js';

const itemExtra = (subtype: number): GameObject['extra'] => ({
  kind: 'item',
  subtype,
  flags: 0,
  raw: new Int32Array(0),
});

function item(pid: number, subtype = 5, quantity?: number): GameObject {
  const o = fake(0, -1, 0, itemExtra(subtype));
  o.pid = pid;
  if (quantity !== undefined) o.quantity = quantity;
  return o;
}

function setup() {
  const map = emptyMap();
  const player = put(map, fake(1, 20100, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) }));
  const npc = put(map, fake(1, 20200, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) }));
  npc.pid = (1 << 24) | 5;
  const objects = new Map<number, GameObject>();
  for (const o of map.objects) objects.set(o.id, o);
  const inv = new InventoryModel({ objects, currentMap: () => map, player: () => player });
  const reg = (o: GameObject): GameObject => {
    objects.set(o.id, o);
    return o;
  };
  return { map, player, npc, objects, inv, reg };
}

describe('InventoryModel', () => {
  it('test_party_add_remove_and_member_by_pid', () => {
    const { inv, npc, player } = setup();
    expect(inv.partyMemberObj(npc.pid)).toBe(-1);
    inv.partyAdd(player.id);
    expect(inv.partyMemberObj(player.pid)).toBe(-1);
    inv.partyAdd(npc.id);
    expect(inv.partyMemberObj(npc.pid)).toBe(npc.id);
    inv.partyRemove(npc.id);
    expect(inv.partyMemberObj(npc.pid)).toBe(-1);
  });

  it('test_add_obj_to_inven_takes_item_off_map', () => {
    const { inv, map, npc, reg } = setup();
    const gun = reg(put(map, fake(0, 20300, 0, itemExtra(3))));
    gun.pid = 8;
    inv.addObjToInven(npc.id, gun.id);
    expect(npc.inventory).toEqual([gun]);
    expect(map.objects).not.toContain(gun);
    expect(gun.hex).toBe(-1);
    expect(inv.invenCount(npc.id)).toBe(1);
    expect(inv.invenObjByPid(npc.id, 8)).toBe(gun.id);
    expect(inv.itemSubtype(gun.id)).toBe(3);
  });

  it('test_add_obj_to_inven_refuses_item_already_held', () => {
    const { inv, map, npc, reg } = setup();
    const other = reg(put(map, fake(1, 20301, 0, itemExtra(3))));
    const gun = reg(put(map, fake(0, 20300, 0, itemExtra(3))));
    inv.addObjToInven(npc.id, gun.id);
    inv.addObjToInven(other.id, gun.id);
    expect(npc.inventory).toEqual([gun]);
    expect(other.inventory).toEqual([]);
  });

  it('test_add_mult_stacks_same_pid_and_count_includes_nested', () => {
    const { inv, npc, reg } = setup();
    const a = reg(item(40));
    const b = reg(item(40));
    inv.addMultObjsToInven(npc.id, a.id, 5);
    inv.addMultObjsToInven(npc.id, b.id, 3);
    expect(npc.inventory.length).toBe(1);
    expect(inv.invenCountPid(npc.id, 40)).toBe(8);
    const bag = reg(item(90, 1));
    const inner = reg(item(40, 5, 2));
    bag.inventory.push(inner);
    inv.addObjToInven(npc.id, bag.id);
    expect(inv.invenCountPid(npc.id, 40)).toBe(10);
  });

  it('test_rm_mult_removes_partial_and_reports_count', () => {
    const { inv, npc, reg } = setup();
    const a = reg(item(40, 5, 5));
    inv.addObjToInven(npc.id, a.id);
    expect(inv.rmMultObjsFromInven(npc.id, a.id, 2)).toBe(2);
    expect(inv.invenCountPid(npc.id, 40)).toBe(3);
    expect(inv.rmMultObjsFromInven(npc.id, a.id, 10)).toBe(3);
    expect(npc.inventory.length).toBe(0);
  });

  it('test_rm_mult_is_by_object_identity_not_pid', () => {
    const { inv, npc, reg } = setup();
    const a = reg(item(40, 5, 5));
    inv.addObjToInven(npc.id, a.id);
    const other = reg(item(40, 5, 2));
    expect(inv.rmMultObjsFromInven(npc.id, other.id, 2)).toBe(0);
    expect(inv.invenCountPid(npc.id, 40)).toBe(5);
  });

  it('test_add_mult_clamps_count', () => {
    const { inv, npc, reg } = setup();
    const a = reg(item(41));
    inv.addMultObjsToInven(npc.id, a.id, 0);
    expect(npc.inventory.length).toBe(0);
    inv.addMultObjsToInven(npc.id, a.id, -7);
    expect(inv.invenCountPid(npc.id, 41)).toBe(1);
    const b = reg(item(42));
    inv.addMultObjsToInven(npc.id, b.id, 200000);
    expect(inv.invenCountPid(npc.id, 42)).toBe(500);
  });

  it('test_stack_merge_requires_same_script_and_not_equipped', () => {
    const { inv, npc, reg } = setup();
    const a = reg(item(40, 5, 1));
    const b = reg(item(40, 5, 1));
    b.scriptId = 7;
    const c = reg(item(40, 5, 1));
    c.flags |= 0x01000000;
    inv.addObjToInven(npc.id, a.id);
    inv.addObjToInven(npc.id, b.id);
    inv.addObjToInven(npc.id, c.id);
    expect(npc.inventory.length).toBe(3);
  });

  it('test_party_add_dedups_by_pid', () => {
    const { inv, npc, reg } = setup();
    const twin = reg(fake(1, 20300, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) }));
    twin.pid = npc.pid;
    inv.partyAdd(npc.id);
    inv.partyAdd(twin.id);
    expect(inv.party.size).toBe(1);
  });

  it('test_caps_adjust_negative_spans_stacks_and_containers', () => {
    const { inv, npc, reg } = setup();
    const a = reg(item(PID_BOTTLE_CAPS, 5, 30));
    const bag = reg(item(90, 1));
    const inner = reg(item(PID_BOTTLE_CAPS, 5, 50));
    bag.inventory.push(inner);
    npc.inventory.push(a, bag);
    expect(inv.itemCapsTotal(npc.id)).toBe(80);
    expect(inv.itemCapsAdjust(npc.id, -70)).toBe(0);
    expect(inv.itemCapsTotal(npc.id)).toBe(10);
    expect(inv.itemCapsAdjust(npc.id, 5)).toBe(0);
    expect(inv.itemCapsTotal(npc.id)).toBe(15);
  });

  it('test_player_slot_follows_active_hand', () => {
    const { map, player, objects, reg } = setup();
    let hand = 0;
    const inv = new InventoryModel({
      objects,
      currentMap: () => map,
      player: () => player,
      activeHand: () => hand,
    });
    const gun = reg(item(8, 3));
    const knife = reg(item(9, 3));
    inv.equipment.set(player.id, { right: gun, left: knife });
    expect(inv.invenSlotObj(player.id, 1)).toBe(-1);
    expect(inv.invenSlotObj(player.id, 2)).toBe(knife.id);
    hand = 1;
    expect(inv.invenSlotObj(player.id, 1)).toBe(gun.id);
    expect(inv.invenSlotObj(player.id, 2)).toBe(-1);
  });

  it('test_rm_obj_from_inven_detaches_and_unequips', () => {
    const { inv, npc, reg } = setup();
    const gun = reg(item(8, 3));
    inv.addObjToInven(npc.id, gun.id);
    inv.wieldObjCritter(npc.id, gun.id);
    expect(inv.invenSlotObj(npc.id, 1)).toBe(gun.id);
    inv.rmObjFromInven(npc.id, gun.id);
    expect(npc.inventory.length).toBe(0);
    expect(inv.invenSlotObj(npc.id, 1)).toBe(-1);
  });

  it('test_wield_armor_goes_to_worn_slot', () => {
    const { inv, npc, reg } = setup();
    const armor = reg(item(3, 0));
    inv.addObjToInven(npc.id, armor.id);
    inv.wieldObjCritter(npc.id, armor.id);
    expect(inv.invenSlotObj(npc.id, 0)).toBe(armor.id);
    expect(inv.invenSlotObj(npc.id, 2)).toBe(-1);
  });

  it('test_item_subtype_of_non_item_is_minus_one', () => {
    const { inv, npc } = setup();
    expect(inv.itemSubtype(npc.id)).toBe(-1);
    expect(inv.itemSubtype(999999)).toBe(-1);
  });

  it('test_caps_total_and_adjust', () => {
    const { inv, npc } = setup();
    expect(inv.itemCapsTotal(npc.id)).toBe(0);
    expect(inv.itemCapsAdjust(npc.id, 100)).toBe(0);
    expect(inv.itemCapsAdjust(npc.id, 50)).toBe(0);
    expect(inv.itemCapsTotal(npc.id)).toBe(150);
    expect(inv.itemCapsAdjust(npc.id, -200)).toBe(-1);
    expect(inv.itemCapsAdjust(npc.id, -120)).toBe(0);
    expect(inv.itemCapsTotal(npc.id)).toBe(30);
    expect(inv.invenCountPid(npc.id, PID_BOTTLE_CAPS)).toBe(30);
  });

  it('test_register_inventories_assigns_unique_ids', () => {
    const { inv, npc, objects } = setup();
    const a = item(40);
    const b = item(41);
    a.id = -1;
    b.id = -1;
    npc.inventory.push(a, b);
    inv.registerInventories([npc]);
    expect(a.id).not.toBe(b.id);
    expect(objects.get(a.id)).toBe(a);
    expect(inv.invenObjByPid(npc.id, 41)).toBe(b.id);
  });
});

describe('InventoryModel + PartyScriptPort (party_add / party_remove w VM)', () => {
  function withPort(limit?: () => number) {
    const s = setup();
    const st = new PartyState([], { objId: s.player.id, pid: s.player.pid });
    const inv = new InventoryModel({
      objects: s.objects,
      currentMap: () => s.map,
      player: () => s.player,
      party: new PartyScriptAdapter(st, limit),
    });
    return { ...s, inv, st };
  }
  const crit = (reg: (o: GameObject) => GameObject, pid: number): GameObject => {
    const o = reg(fake(1, 20300 + pid, 0, { kind: 'critter', flags: 0, raw: new Int32Array(0) }));
    o.pid = (1 << 24) | pid;
    return o;
  };

  it('partyAdd zapisuje w PartyState i ustawia flagi 0x404', () => {
    const { inv, npc, st } = withPort();
    inv.partyAdd(npc.id);
    expect(st.memberCount).toBe(1);
    expect(npc.flags & 0x404).toBe(0x404);
    expect(inv.partyMemberObj(npc.pid)).toBe(npc.id);
  });
  it('limit z portu blokuje dodanie ponad limit', () => {
    const { inv, npc, reg, st } = withPort(() => 1);
    const b = crit(reg, 9);
    inv.partyAdd(npc.id);
    inv.partyAdd(b.id);
    expect(inv.party.size).toBe(1);
    expect(st.memberCount).toBe(1);
    expect(b.flags & 0x404).toBe(0);
  });
  it('partyRemove czyści flagi i zwalnia miejsce', () => {
    const { inv, npc, reg, st } = withPort(() => 1);
    const b = crit(reg, 9);
    inv.partyAdd(npc.id);
    inv.partyRemove(npc.id);
    expect(npc.flags & 0x404).toBe(0);
    expect(st.memberCount).toBe(0);
    inv.partyAdd(b.id);
    expect(inv.party.has(b.id)).toBe(true);
  });
  it('DENIED blokuje rekrutację', () => {
    const { inv, npc, st } = withPort();
    st.denied = true;
    inv.partyAdd(npc.id);
    expect(inv.party.size).toBe(0);
  });
});
