import {
  ItemType,
  Slot,
  cloneObject,
  containerCapacity,
  isTwoHanded,
  itemWeight,
  totalWeight,
  usedSize,
  type ArmorProto,
  type EquipMeta,
  type GameObject,
  type InventoryItem,
  type ItemsContext,
} from './items.js';
import { PERK_DEFS, perkAddForce, perkRemove, type Perk } from './perks.js';
import { statLevel } from './stats.js';
import { Stat, type Result } from './types.js';
import type { StatDelta } from './timed-effects.js';

const ok: Result = { ok: true };
const fail = (reason: string): Result => ({ ok: false, reason });

function find(owner: GameObject, obj: GameObject): InventoryItem | undefined {
  return owner.inventory.find((e) => e.obj === obj);
}

function slotOf(owner: GameObject, obj: GameObject): Slot | null {
  const i = owner.equipped.indexOf(obj);
  return i < 0 ? null : (i as Slot);
}

/** Odswieza pole krytera zalezne od inwentarza (waga, trzymane przedmioty). */
function refresh(owner: GameObject, ctx: ItemsContext): void {
  const c = owner.critter;
  if (!c) return;
  c.carriedWeight = totalWeight(owner, ctx.protos);
  c.heldItemPids = [owner.equipped[Slot.LeftHand], owner.equipped[Slot.RightHand]]
    .filter((o): o is GameObject => o !== null)
    .map((o) => o.pid);
  c.hasRealWeaponInHand =
    (owner.equipMeta[Slot.LeftHand]?.isWeapon ?? false) ||
    (owner.equipMeta[Slot.RightHand]?.isWeapon ?? false);
}

export interface CanCarryOptions {
  /**
   * Twardy limit udzwigu (Carry Weight) dla warstwy UI/podnoszenia. Domyslnie wylaczony:
   * spec inventory.md zna tylko limit rozmiaru kontenera, przekroczenie udzwigu to kara (Z).
   */
  enforceWeight?: boolean;
}

/** Czy do wlasciciela zmiesci sie `count` sztuk (nabojow dla amunicji). */
export function canCarry(
  owner: GameObject,
  obj: GameObject,
  count: number,
  ctx: ItemsContext,
  opts: CanCarryOptions = {},
): Result {
  if (count <= 0) return fail('invalid-count');
  const p = ctx.protos(obj.pid);
  if (!p) return fail('unknown-proto');
  const stacks =
    p.type === ItemType.Ammo ? Math.trunc((count - 1) / Math.max(1, p.quantityPerStack)) + 1 : 0;
  if (opts.enforceWeight && owner.critter) {
    const added =
      p.type === ItemType.Ammo ? stacks * p.weight : itemWeight(obj, ctx.protos) * count;
    const cap = statLevel(owner.critter, Stat.CarryWeight, ctx);
    if (totalWeight(owner, ctx.protos) + added > cap) return fail('too-heavy');
  }
  const op = ctx.protos(owner.pid);
  if (op?.type === ItemType.Container) {
    const addSize = p.type === ItemType.Ammo ? p.size * stacks : p.size * count;
    if (usedSize(owner, ctx.protos) + addSize > containerCapacity(op))
      return fail('container-full');
  }
  return ok;
}

function stackable(a: GameObject, b: GameObject): boolean {
  return (
    a.pid === b.pid &&
    a.inventory.length === 0 &&
    b.inventory.length === 0 &&
    a.rounds === b.rounds &&
    a.ammoPid === b.ammoPid
  );
}

/** Dodaje; dla amunicji `count` to liczba nabojow (dopelnianie stosow do quantityPerStack). */
export function addItem(
  owner: GameObject,
  obj: GameObject,
  count: number,
  ctx: ItemsContext,
): Result {
  if (find(owner, obj)) return fail('already-in-inventory');
  const chk = canCarry(owner, obj, count, ctx);
  if (!chk.ok) return chk;
  const p = ctx.protos(obj.pid);
  if (p?.type === ItemType.Ammo) {
    let left = count;
    const cap = Math.max(1, p.quantityPerStack);
    for (const e of owner.inventory) {
      if (left === 0) break;
      if (e.obj.pid !== obj.pid || e.obj.rounds >= cap) continue;
      const take = Math.min(left, cap - e.obj.rounds);
      e.obj.rounds += take;
      left -= take;
    }
    let first = true;
    while (left > 0) {
      const chunk = Math.min(left, cap);
      const o = first ? obj : cloneObject(obj, ctx);
      first = false;
      o.rounds = chunk;
      o.owner = owner;
      owner.inventory.push({ obj: o, count: 1 });
      left -= chunk;
    }
    if (first) obj.owner = null;
  } else {
    const same = owner.inventory.find(
      (e) =>
        stackable(e.obj, obj) && slotOf(owner, e.obj) === null && p?.type !== ItemType.Container,
    );
    if (same) same.count += count;
    else {
      obj.owner = owner;
      owner.inventory.push({ obj, count });
    }
  }
  refresh(owner, ctx);
  return ok;
}

/** Zdejmuje wyposazenie ze slotu bez kontroli (bez ctx: uzywa zapamietanych deltas). */
function unequipRaw(owner: GameObject, slot: Slot): void {
  const meta = owner.equipMeta[slot];
  if (meta && owner.critter)
    for (const d of meta.deltas)
      owner.critter.bonusStats[d.stat] = (owner.critter.bonusStats[d.stat] ?? 0) - d.amount;
  if (meta?.perk !== undefined && owner.critter) perkRemove(owner.critter, meta.perk as Perk);
  owner.equipped[slot] = null;
  owner.equipMeta[slot] = null;
}

/**
 * Usuwa `count` (dla amunicji: nabojow ze stosu `obj`). Odchylenie od briefu: 4. argument ctx
 * (potrzebny do przeliczenia wagi).
 */
export function removeItem(
  owner: GameObject,
  obj: GameObject,
  count: number,
  ctx: ItemsContext,
): Result {
  const r = detach(owner, obj, count, ctx);
  return 'ok' in r ? r : ok;
}

function detach(
  owner: GameObject,
  obj: GameObject,
  count: number,
  ctx: ItemsContext,
): Result | { obj: GameObject } {
  const e = find(owner, obj);
  if (!e) return fail('not-in-inventory');
  if (count <= 0) return fail('invalid-count');
  const p = ctx.protos(obj.pid);
  const isAmmo = p?.type === ItemType.Ammo;
  const have = isAmmo ? obj.rounds : e.count;
  if (count > have) return fail('insufficient-count');
  const slot = slotOf(owner, obj);
  let out: GameObject;
  if (count === have) {
    if (slot !== null) unequipRaw(owner, slot);
    owner.inventory.splice(owner.inventory.indexOf(e), 1);
    obj.owner = null;
    out = obj;
  } else if (isAmmo) {
    out = cloneObject(obj, ctx);
    out.rounds = count;
    obj.rounds -= count;
  } else {
    out = cloneObject(obj, ctx);
    e.count -= count;
  }
  refresh(owner, ctx);
  return { obj: out };
}

interface Snapshot {
  inv: { e: InventoryItem; count: number; rounds: number; owner: GameObject | null }[];
}
function snap(o: GameObject): Snapshot {
  return {
    inv: o.inventory.map((e) => ({ e, count: e.count, rounds: e.obj.rounds, owner: e.obj.owner })),
  };
}
function restore(o: GameObject, s: Snapshot): void {
  o.inventory = s.inv.map((x) => {
    x.e.count = x.count;
    x.e.obj.rounds = x.rounds;
    x.e.obj.owner = x.owner;
    return x.e;
  });
}

/** Atomowe przeniesienie: albo oba kontenery sie zmieniaja, albo zaden. */
export function moveItem(
  from: GameObject,
  to: GameObject,
  obj: GameObject,
  count: number,
  ctx: ItemsContext,
): Result {
  const e = find(from, obj);
  if (!e) return fail('not-in-inventory');
  if (from === to) return ok;
  const isAmmo = ctx.protos(obj.pid)?.type === ItemType.Ammo;
  if (count > (isAmmo ? obj.rounds : e.count)) return fail('insufficient-count');
  // Zawartosc przenoszonego obiektu jest juz w jego wadze; sprawdz cel przed jakakolwiek zmiana.
  const chk = canCarry(to, obj, count, ctx);
  if (!chk.ok) return chk;
  const sFrom = snap(from);
  const sTo = snap(to);
  const wasEquipped = slotOf(from, obj);
  const meta = wasEquipped !== null ? from.equipMeta[wasEquipped] : null;
  const r = detach(from, obj, count, ctx);
  if ('ok' in r) return r;
  const added = addItem(to, r.obj, count, ctx);
  if (!added.ok) {
    restore(from, sFrom);
    restore(to, sTo);
    if (wasEquipped !== null && meta) {
      from.equipped[wasEquipped] = obj;
      from.equipMeta[wasEquipped] = meta;
      if (from.critter)
        for (const d of meta.deltas)
          from.critter.bonusStats[d.stat] = (from.critter.bonusStats[d.stat] ?? 0) + d.amount;
      if (meta.perk !== undefined && from.critter) perkAddForce(from.critter, meta.perk as Perk);
    }
    refresh(from, ctx);
    refresh(to, ctx);
    return added;
  }
  return ok;
}

const DR_BASE = Stat.DrNormal;
const DT_BASE = Stat.DtNormal;

function armorDeltas(a: ArmorProto): StatDelta[] {
  const d: StatDelta[] = [{ stat: Stat.ArmorClass, amount: a.armorClass }];
  for (let i = 0; i < 7; i++) {
    d.push({ stat: DR_BASE + i, amount: a.damageResistance[i] ?? 0 });
    d.push({ stat: DT_BASE + i, amount: a.damageThreshold[i] ?? 0 });
  }
  return d;
}

/** Zaklada przedmiot; pancerz zmienia AC/DR/DT przez bonusStats. */
export function equip(owner: GameObject, obj: GameObject, slot: Slot, ctx: ItemsContext): Result {
  const e = find(owner, obj);
  if (!e) return fail('not-in-inventory');
  const p = ctx.protos(obj.pid);
  if (!p) return fail('unknown-proto');
  const isArmor = p.type === ItemType.Armor;
  if (isArmor !== (slot === Slot.Armor)) return fail('wrong-slot');
  if (p.type === ItemType.Ammo || p.type === ItemType.Key) return fail('wrong-slot');
  if (slot !== Slot.Armor) {
    const other = owner.equipped[slot === Slot.LeftHand ? Slot.RightHand : Slot.LeftHand];
    if (other && other !== obj) {
      if (isTwoHanded(p) || isTwoHanded(ctx.protos(other.pid))) return fail('two-handed-conflict');
    }
  }
  // Wyposazamy pojedyncza sztuke: reszta stosu zostaje w inwentarzu.
  let target = obj;
  if (e.count > 1) {
    target = cloneObject(obj, ctx);
    e.count -= 1;
    target.owner = owner;
    owner.inventory.push({ obj: target, count: 1 });
  }
  const cur = slotOf(owner, target);
  if (cur !== null) unequipRaw(owner, cur);
  const prev = owner.equipped[slot];
  if (prev) unequipRaw(owner, slot);
  const deltas = isArmor ? armorDeltas(p) : [];
  if (owner.critter)
    for (const d of deltas)
      owner.critter.bonusStats[d.stat] = (owner.critter.bonusStats[d.stat] ?? 0) + d.amount;
  // Perk pancerza (ArmorProto.perk): nadawany przy zalozeniu, zdejmowany w unequipRaw (Z, inventory.md).
  const meta: EquipMeta = { deltas, isWeapon: p.type === ItemType.Weapon };
  if (isArmor && owner.critter && p.perk >= 0 && PERK_DEFS[p.perk]) {
    if (perkAddForce(owner.critter, p.perk as Perk).ok) meta.perk = p.perk;
  }
  owner.equipped[slot] = target;
  owner.equipMeta[slot] = meta;
  refresh(owner, ctx);
  return ok;
}

export function unequip(owner: GameObject, slot: Slot, ctx: ItemsContext): Result {
  if (!owner.equipped[slot]) return fail('slot-empty');
  unequipRaw(owner, slot);
  refresh(owner, ctx);
  return ok;
}

/** Przenosi wszystko, co sie zmiesci; reszta ladnie raportuje blokady (kolejne pozycje sa nadal probowane). */
export function takeAll(
  from: GameObject,
  to: GameObject,
  ctx: ItemsContext,
): { moved: number; blocked: Result[] } {
  let moved = 0;
  const blocked: Result[] = [];
  for (const e of [...from.inventory]) {
    const isAmmo = ctx.protos(e.obj.pid)?.type === ItemType.Ammo;
    const r = moveItem(from, to, e.obj, isAmmo ? e.obj.rounds : e.count, ctx);
    if (r.ok) moved++;
    else blocked.push(r);
  }
  return { moved, blocked };
}
