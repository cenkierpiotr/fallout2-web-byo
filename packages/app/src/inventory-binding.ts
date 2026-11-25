/**
 * Adapter inwentarza: GameObject (rules) -> InventoryView/ContainerView + InventoryCommands (ui).
 * Wyposazone przedmioty zostaja w owner.inventory, widok je z listy wylacza.
 */
import {
  ItemType,
  Slot,
  Stat,
  equip,
  itemWeight,
  moveItem,
  removeItem,
  statLevel,
  takeAll,
  totalWeight,
  unequip,
  useItem,
  type ArmorProto,
  type GameObject,
  type ItemUseContext,
} from '../../rules/src/index.js';
import type {
  CommandResult,
  ContainerView,
  EquipSlot,
  InventoryCommands,
  InventoryView,
  ItemCategory,
  ItemView,
} from '../../ui/src/screens/inventory/types.js';
import { createStore, type Store } from './store.js';

export interface InventoryBindingDeps {
  player: GameObject;
  itemsContext: () => ItemUseContext;
  itemMeta: (pid: number) => { name: string; fid: number };
  paperdollFid: (armorPid: number | null) => number;
  onDrop: (obj: GameObject, count: number) => void;
  onChange?: () => void;
}

export interface InventoryBinding {
  inventory: Store<InventoryView>;
  container: Store<ContainerView | null>;
  commands: InventoryCommands;
  openContainer(c: GameObject, name: string): void;
  refresh(): void;
}

const SLOT_MAP: Record<EquipSlot, Slot> = {
  left: Slot.LeftHand,
  right: Slot.RightHand,
  armor: Slot.Armor,
};

function category(type: ItemType | undefined): ItemCategory {
  switch (type) {
    case ItemType.Armor:
      return 'armor';
    case ItemType.Weapon:
      return 'weapon';
    case ItemType.Drug:
      return 'drug';
    case ItemType.Ammo:
      return 'ammo';
    case ItemType.Key:
      return 'quest';
    default:
      return 'misc';
  }
}

export function createInventoryBinding(deps: InventoryBindingDeps): InventoryBinding {
  const { player } = deps;
  const ctx = (): ItemUseContext => deps.itemsContext();
  const containerRef: { obj: GameObject | null; name: string } = { obj: null, name: '' };

  const itemView = (obj: GameObject, entryCount: number): ItemView => {
    const c = ctx();
    const proto = c.protos(obj.pid);
    const meta = deps.itemMeta(obj.pid);
    const isAmmo = proto?.type === ItemType.Ammo;
    const count = isAmmo ? obj.rounds : entryCount;
    const total = itemWeight(obj, c.protos);
    const view: ItemView = {
      id: obj.id,
      pid: obj.pid,
      name: meta.name,
      fid: meta.fid,
      category: category(proto?.type),
      count,
      weight: isAmmo && obj.rounds > 0 ? total / obj.rounds : total,
      value: proto?.cost ?? 0,
      usable: proto?.type === ItemType.Drug,
    };
    if (proto?.type === ItemType.Armor) {
      const a = proto as ArmorProto;
      view.stats = { dt: a.damageThreshold[0] ?? 0, dr: a.damageResistance[0] ?? 0 };
    }
    return view;
  };

  const isEquipped = (o: GameObject): boolean => player.equipped.some((e) => e === o);

  const buildInventory = (): InventoryView => {
    const c = ctx();
    const slotView = (s: Slot): ItemView | null => {
      const o = player.equipped[s];
      return o ? itemView(o, 1) : null;
    };
    const armor = player.equipped[Slot.Armor];
    const crit = player.critter;
    return {
      items: player.inventory
        .filter((e) => !isEquipped(e.obj))
        .map((e) => itemView(e.obj, e.count)),
      weight: totalWeight(player, c.protos),
      weightMax: crit ? statLevel(crit, Stat.CarryWeight, c) : 0,
      slots: {
        left: slotView(Slot.LeftHand),
        right: slotView(Slot.RightHand),
        armor: slotView(Slot.Armor),
      },
      paperdollFid: deps.paperdollFid(armor ? armor.pid : null),
    };
  };

  const buildContainer = (): ContainerView | null =>
    containerRef.obj
      ? {
          id: containerRef.obj.id,
          name: containerRef.name,
          items: containerRef.obj.inventory.map((e) => itemView(e.obj, e.count)),
        }
      : null;

  const inventory = createStore<InventoryView>(buildInventory());
  const container = createStore<ContainerView | null>(buildContainer());

  const refresh = (): void => {
    inventory.value = buildInventory();
    container.value = buildContainer();
  };

  const done = (r: CommandResult): CommandResult => {
    refresh();
    deps.onChange?.();
    return r;
  };

  const maxCount = (o: GameObject, entryCount: number): number =>
    ctx().protos(o.pid)?.type === ItemType.Ammo ? o.rounds : entryCount;

  const commands: InventoryCommands = {
    use(itemId) {
      const e = player.inventory.find((x) => x.obj.id === itemId);
      if (!e) return { ok: false, reason: 'not-found' };
      const r = useItem(player, e.obj, null, ctx());
      return done(r.ok ? { ok: true } : { ok: false, reason: r.reason ?? 'not-usable' });
    },
    equip(itemId, slot) {
      const e = player.inventory.find((x) => x.obj.id === itemId && !isEquipped(x.obj));
      if (!e) return { ok: false, reason: 'not-found' };
      return done(equip(player, e.obj, SLOT_MAP[slot], ctx()));
    },
    unequip(slot) {
      return done(unequip(player, SLOT_MAP[slot], ctx()));
    },
    drop(itemId, count) {
      const e = player.inventory.find((x) => x.obj.id === itemId && !isEquipped(x.obj));
      if (!e) return { ok: false, reason: 'not-found' };
      if (count <= 0 || count > maxCount(e.obj, e.count))
        return { ok: false, reason: 'insufficient-count' };
      const r = removeItem(player, e.obj, count, ctx());
      if (r.ok) deps.onDrop(e.obj, count);
      return done(r);
    },
    move(itemId, count, to) {
      const box = containerRef.obj;
      if (!box) return { ok: false, reason: 'no-container' };
      const from = to === 'container' ? player : box;
      const dest = to === 'container' ? box : player;
      const e = from.inventory.find(
        (x) => x.obj.id === itemId && !(from === player && isEquipped(x.obj)),
      );
      if (!e) return { ok: false, reason: 'not-found' };
      if (count <= 0 || count > maxCount(e.obj, e.count))
        return { ok: false, reason: 'insufficient-count' };
      return done(moveItem(from, dest, e.obj, count, ctx()));
    },
    takeAll() {
      const box = containerRef.obj;
      if (!box) return { ok: false, reason: 'no-container' };
      const wasEmpty = box.inventory.length === 0;
      const r = takeAll(box, player, ctx());
      const first = r.blocked[0];
      return done(r.moved > 0 || wasEmpty || !first ? { ok: true } : first);
    },
    closeContainer() {
      containerRef.obj = null;
      containerRef.name = '';
      done({ ok: true });
    },
  };

  return {
    inventory,
    container,
    commands,
    openContainer(c, name) {
      containerRef.obj = c;
      containerRef.name = name;
      refresh();
    },
    refresh,
  };
}
