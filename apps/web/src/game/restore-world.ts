import { pidType, type Proto } from '@f2/formats';
import {
  indexObject,
  type Direction,
  type GameMap,
  type GameObject,
  type MapStateJSON,
  type SaveItem,
  type SaveMapObject,
} from '@f2/engine-core';
import { FLAG_LEFT_HAND, FLAG_RIGHT_HAND, FLAG_WORN } from './save-world';

/** Zrodlo prototypow (zwykle `ProtoCache` z engine-core). */
export interface ProtoSource {
  get(pid: number): Promise<Proto>;
  placeholderFor?(pid: number): Proto;
}

const SLOT_FLAG = { left: FLAG_LEFT_HAND, right: FLAG_RIGHT_HAND, armor: FLAG_WORN } as const;

/** Id nowo tworzonych obiektow (przedmioty z zapisu bez id): wysoki zakres, by nie kolidowac z mapa. */
let nextRestoredId = 0x4000_0000;

async function protoOf(protos: ProtoSource, pid: number): Promise<Proto> {
  try {
    return await protos.get(pid);
  } catch (e) {
    if (protos.placeholderFor) return protos.placeholderFor(pid);
    throw e;
  }
}

/** Przedmiot z zapisu -> `GameObject` (stos, flaga zalozenia, zawartosc rekurencyjnie). */
export async function itemFromSave(it: SaveItem, protos: ProtoSource): Promise<GameObject> {
  const proto = await protoOf(protos, it.pid);
  const inventory: GameObject[] = [];
  for (const c of it.contents) inventory.push(await itemFromSave(c, protos));
  const slot = it.equippedSlot;
  return {
    id: nextRestoredId++,
    pid: it.pid,
    fid: proto.fid,
    type: pidType(it.pid),
    hex: -1,
    elevation: 0,
    rotation: 0,
    frame: 0,
    flags: slot ? SLOT_FLAG[slot] : 0,
    protoFlags: proto.flags,
    scriptId: -1,
    localVars: new Int32Array(0),
    inventory,
    quantity: it.count,
    proto,
    extra: {
      kind: 'item',
      subtype: 0,
      flags: 0,
      // bron: [naboje, PID amunicji]; brak ammoPid (stary zapis) = pusto, czyli bez modyfikatorow
      raw: it.ammoPid != null ? Int32Array.of(it.ammo ?? 0, it.ammoPid) : new Int32Array(0),
    } as GameObject['extra'],
    hidden: false,
  };
}

export async function inventoryFromSave(
  items: readonly SaveItem[],
  protos: ProtoSource,
): Promise<GameObject[]> {
  const out: GameObject[] = [];
  for (const it of items) out.push(await itemFromSave(it, protos));
  return out;
}

async function objectFromSave(
  so: SaveMapObject,
  elevation: 0 | 1 | 2,
  protos: ProtoSource,
): Promise<GameObject> {
  const proto = await protoOf(protos, so.pid);
  const type = pidType(so.pid);
  return {
    id: so.objId,
    pid: so.pid,
    fid: proto.fid,
    type,
    hex: so.hex,
    elevation,
    rotation: (so.orientation % 6) as Direction,
    frame: 0,
    flags: so.flags,
    protoFlags: proto.flags,
    scriptId: so.scriptLocalId ?? -1,
    localVars: new Int32Array(0),
    inventory: await inventoryFromSave(so.inventory, protos),
    proto,
    extra:
      type === 1
        ? ({ kind: 'critter', flags: 0, raw: new Int32Array(10) } as GameObject['extra'])
        : ({ kind: 'item', subtype: 0, flags: 0, raw: new Int32Array(0) } as GameObject['extra']),
    hidden: (so.flags & 1) !== 0,
  };
}

/**
 * Odtwarza obiekty zywej mapy ze stanu rejestru: obiekty istniejace (po `objId`) dostaja pozycje,
 * flagi i ekwipunek z zapisu, brakujace w zapisie sa usuwane (zniszczone/podniesione), nowe
 * (np. upuszczone) buduje sie z prototypow. Gracza (`player`) nie ruszamy.
 */
export async function restoreMapObjects(
  map: GameMap,
  state: MapStateJSON,
  protos: ProtoSource,
  player: GameObject,
): Promise<void> {
  const byId = new Map<number, GameObject>();
  for (const o of map.objects) byId.set(o.id, o);
  const next: GameObject[] = [];
  const seen = new Set<number>();
  for (const [e, el] of state.elevations.entries()) {
    const elevation = e as 0 | 1 | 2;
    for (const so of el.objects) {
      if (so.objId === player.id) continue;
      seen.add(so.objId);
      const live = byId.get(so.objId);
      if (live && live.pid === so.pid) {
        live.hex = so.hex;
        live.elevation = elevation;
        live.rotation = (so.orientation % 6) as Direction;
        live.flags = so.flags;
        live.hidden = (so.flags & 1) !== 0;
        live.inventory = await inventoryFromSave(so.inventory, protos);
        next.push(live);
      } else {
        next.push(await objectFromSave(so, elevation, protos));
      }
    }
  }
  const keep = map.objects.includes(player);
  map.objects = keep ? [...next, player] : next;
  map.byHex.clear();
  for (const o of map.objects) indexObject(map, o);
  if (!keep) indexObject(map, player);
  map.localVars = Int32Array.from(state.mapVars);
}
