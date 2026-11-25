import { describe, expect, it } from 'vitest';
import { InventoryModel, PartyState, PartyScriptAdapter, type GameObject } from '../index.js';
import { emptyMap, fake, put } from './helpers.js';

const crit = (): GameObject['extra'] => ({ kind: 'critter', flags: 0, raw: new Int32Array(0) });

function setup() {
  const oldMap = emptyMap();
  const player = put(oldMap, fake(1, 20100, 0, crit()));
  const npc = put(oldMap, fake(1, 20102, 0, crit()));
  npc.pid = (1 << 24) | 5;
  const objects = new Map<number, GameObject>();
  for (const o of oldMap.objects) objects.set(o.id, o);
  let cur = oldMap;
  const state = new PartyState([{ pid: npc.pid } as never], { objId: player.id, pid: player.pid });
  const inv = new InventoryModel({
    objects,
    currentMap: () => cur,
    player: () => player,
    party: new PartyScriptAdapter(state),
  });
  return { oldMap, player, npc, objects, inv, state, setMap: (m: typeof oldMap) => (cur = m) };
}

describe('druzyna przy zmianie mapy i wczytaniu', () => {
  it('detachParty zdejmuje towarzysza z mapy, attachParty stawia go przy graczu na nowej', () => {
    const s = setup();
    s.inv.partyAdd(s.npc.id);
    const carried = s.inv.detachParty();
    expect(carried).toEqual([s.npc]);
    expect(s.oldMap.objects.includes(s.npc)).toBe(false);
    const next = emptyMap();
    s.setMap(next);
    s.objects.clear();
    s.player.hex = 20500;
    next.objects.push(s.player);
    s.inv.attachParty(carried);
    expect(next.objects.includes(s.npc)).toBe(true);
    expect(s.npc.hex).not.toBe(s.player.hex);
    expect(s.inv.party.has(s.npc.id)).toBe(true);
    expect(s.inv.partyObjects()).toEqual([s.npc]);
  });

  it('attachParty nadaje nowe id przy kolizji z obiektem nowej mapy, druzyna zostaje spojna', () => {
    const s = setup();
    s.inv.partyAdd(s.npc.id);
    const oldId = s.npc.id;
    const carried = s.inv.detachParty();
    const next = emptyMap();
    s.setMap(next);
    s.objects.clear();
    const other = put(next, fake(1, 20900, 0, crit()));
    other.id = oldId;
    s.objects.set(other.id, other);
    s.inv.attachParty(carried);
    expect(s.npc.id).not.toBe(oldId);
    expect(s.inv.party.has(s.npc.id)).toBe(true);
    expect(s.inv.party.has(oldId)).toBe(false);
    expect(s.inv.partyRemove(s.npc.id)).toBeUndefined();
    expect(s.state.memberCount).toBe(0);
  });

  it('rebindParty odtwarza zbior druzyny z wpisow PartyState po pid', () => {
    const s = setup();
    s.inv.partyAdd(s.npc.id);
    const json = s.state.toJSON();
    s.inv.party.clear();
    s.state.restoreFrom(json);
    expect(s.inv.rebindParty(s.state.entries)).toBe(1);
    expect(s.inv.party.has(s.npc.id)).toBe(true);
    s.inv.partyRemove(s.npc.id);
    expect(s.state.memberCount).toBe(0);
  });

  it('PartyState.restoreFrom zachowuje te sama instancje', () => {
    const s = setup();
    s.inv.partyAdd(s.npc.id);
    const json = s.state.toJSON();
    s.state.remove(json.entries[1]!.objId);
    s.state.restoreFrom(json);
    expect(s.state.memberCount).toBe(1);
  });
});
