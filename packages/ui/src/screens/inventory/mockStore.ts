import { signal, type Signal } from '@preact/signals';
import { stackWeight } from './model';
import type {
  CommandResult,
  ContainerView,
  EquipSlot,
  InventoryCommands,
  InventoryView,
  ItemView,
} from './types';

export interface MockInventory {
  inventory: Signal<InventoryView>;
  container: Signal<ContainerView | null>;
  commands: InventoryCommands;
  /** Dziennik wywolan komend (do asercji w testach). */
  log: string[];
}

const ok: CommandResult = { ok: true };
const fail = (reason: string): CommandResult => ({ ok: false, reason });

/** Waga calego ekwipunku (plecak + sloty). */
export function totalWeight(view: Pick<InventoryView, 'items' | 'slots'>): number {
  const slotted = [view.slots.left, view.slots.right, view.slots.armor];
  return [...view.items, ...slotted].reduce((w, it) => w + (it ? stackWeight(it) : 0), 0);
}

/** Mock `GameView`/`GameCommands` dla ekranu inwentarza: logika zgodna z reguly Zadania 14 w skrocie. */
export function createMockInventory(init: {
  items: ItemView[];
  slots?: Partial<InventoryView['slots']>;
  weightMax: number;
  paperdollFid?: number;
  container?: ContainerView | null;
}): MockInventory {
  const slots = { left: null, right: null, armor: null, ...init.slots };
  const base = { items: init.items, slots };
  const inventory = signal<InventoryView>({
    ...base,
    weight: totalWeight(base),
    weightMax: init.weightMax,
    paperdollFid: init.paperdollFid ?? 0,
  });
  const container = signal<ContainerView | null>(init.container ?? null);
  const log: string[] = [];

  const set = (items: ItemView[], nextSlots = inventory.value.slots) => {
    const next = { items, slots: nextSlots };
    inventory.value = { ...inventory.value, ...next, weight: totalWeight(next) };
  };
  const take = (list: ItemView[], id: number, count: number) => {
    const it = list.find((i) => i.id === id);
    if (!it) return null;
    const n = Math.min(count, it.count);
    const rest =
      n >= it.count
        ? list.filter((i) => i.id !== id)
        : list.map((i) => (i === it ? { ...i, count: it.count - n } : i));
    return { moved: { ...it, count: n }, rest };
  };
  const put = (list: ItemView[], it: ItemView) => {
    const same = list.find((i) => i.pid === it.pid && i.id === it.id);
    return same
      ? list.map((i) => (i === same ? { ...i, count: i.count + it.count } : i))
      : [...list, it];
  };
  const fitsInBackpack = (it: ItemView) =>
    inventory.value.weight + stackWeight(it) <= inventory.value.weightMax;

  const commands: InventoryCommands = {
    use(itemId) {
      log.push(`use:${itemId}`);
      const r = take(inventory.value.items, itemId, 1);
      if (!r) return fail('not-found');
      if (!r.moved.usable) return fail('not-usable');
      set(r.rest);
      return ok;
    },
    equip(itemId, slot: EquipSlot) {
      log.push(`equip:${itemId}:${slot}`);
      const cur = inventory.value;
      const r = take(cur.items, itemId, Number.MAX_SAFE_INTEGER);
      if (!r) return fail('not-found');
      const isArmor = r.moved.category === 'armor';
      if (isArmor !== (slot === 'armor')) return fail('slot-invalid');
      const previous = cur.slots[slot];
      set(previous ? put(r.rest, previous) : r.rest, { ...cur.slots, [slot]: r.moved });
      return ok;
    },
    unequip(slot) {
      log.push(`unequip:${slot}`);
      const cur = inventory.value;
      const it = cur.slots[slot];
      if (!it) return fail('not-found');
      set(put(cur.items, it), { ...cur.slots, [slot]: null });
      return ok;
    },
    drop(itemId, count) {
      log.push(`drop:${itemId}:${count}`);
      const cur = inventory.value;
      const r = take(cur.items, itemId, count);
      if (r) {
        set(r.rest);
        return ok;
      }
      const slot = (['left', 'right', 'armor'] as const).find((s) => cur.slots[s]?.id === itemId);
      if (!slot) return fail('not-found');
      set(cur.items, { ...cur.slots, [slot]: null });
      return ok;
    },
    move(itemId, count, to) {
      log.push(`move:${itemId}:${count}:${to}`);
      const cont = container.value;
      if (!cont) return fail('no-container');
      if (to === 'player') {
        const r = take(cont.items, itemId, count);
        if (!r) return fail('not-found');
        if (!fitsInBackpack(r.moved)) return fail('too-heavy');
        container.value = { ...cont, items: r.rest };
        set(put(inventory.value.items, r.moved));
        return ok;
      }
      const r = take(inventory.value.items, itemId, count);
      if (!r) return fail('not-found');
      set(r.rest);
      container.value = { ...cont, items: put(cont.items, r.moved) };
      return ok;
    },
    takeAll() {
      log.push('takeAll');
      const cont = container.value;
      if (!cont) return fail('no-container');
      let items = inventory.value.items;
      let rest = cont.items;
      let blocked = false;
      for (const it of cont.items) {
        const w = totalWeight({ items, slots: inventory.value.slots }) + stackWeight(it);
        if (w > inventory.value.weightMax) {
          blocked = true;
          continue;
        }
        items = put(items, it);
        rest = rest.filter((i) => i.id !== it.id);
      }
      set(items);
      container.value = { ...cont, items: rest };
      return blocked ? fail('too-heavy') : ok;
    },
    closeContainer() {
      log.push('close');
      container.value = null;
    },
  };
  return { inventory, container, commands, log };
}

/** Zestaw demonstracyjny: `n` przedmiotow roznych kategorii (do testow wydajnosci i playgroundu). */
export function sampleItems(n: number, idBase = 1): ItemView[] {
  const cats = ['weapon', 'armor', 'drug', 'ammo', 'misc', 'quest'] as const;
  return Array.from({ length: n }, (_, i) => {
    const category = cats[i % cats.length] as ItemView['category'];
    const id = idBase + i;
    return {
      id,
      pid: id,
      name: `Przedmiot ${id}`,
      fid: 0x07000000 + (i % 40),
      category,
      count: category === 'ammo' ? 12 : 1,
      weight: (i % 7) + 1,
      value: ((i * 37) % 500) + 5,
      usable: category === 'drug',
      ...(category === 'weapon'
        ? { stats: { damageMin: 5 + (i % 5), damageMax: 12 + (i % 9), range: 20 + (i % 10) } }
        : category === 'armor'
          ? { stats: { dt: i % 6, dr: 10 + (i % 30) } }
          : {}),
    };
  });
}
