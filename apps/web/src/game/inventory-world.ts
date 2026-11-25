import { signal, type Signal } from '@preact/signals';
import { hexDistance, moveObject, type GameObject, type World } from '@f2/engine-core';
import type {
  CommandResult,
  ContainerView,
  EquipSlot,
  InventoryCommands,
  InventoryView,
  ItemCategory,
  ItemView,
} from '@f2/ui';
import { isContainer } from './default-actions';
import { isUnarmedExplosive } from './explosive-host';
import { FLAG_LEFT_HAND, FLAG_RIGHT_HAND, FLAG_WORN, type PlayerSheet } from './save-world';

/**
 * Inwentarz gry na obiektach swiata (`GameObject` z engine-core): widok i komendy dla ekranu UI.
 * Zalozone przedmioty to bity flag 0x1000000/0x2000000/0x4000000 (te same trafiaja do zapisu i
 * decyduja o broni w walce). Limity: udzwig wg wzoru 25 + 25*ST + bonus (jak handel), twardy
 * przy podnoszeniu i przenoszeniu z pojemnika (Z: oryginalny komunikat/zachowanie przy
 * przekroczeniu), pojemnik nie ma limitu rozmiaru (Z).
 */

const EQUIP_MASK = FLAG_LEFT_HAND | FLAG_RIGHT_HAND | FLAG_WORN;
const SLOT_FLAG: Record<EquipSlot, number> = {
  left: FLAG_LEFT_HAND,
  right: FLAG_RIGHT_HAND,
  armor: FLAG_WORN,
};
const STAT_STRENGTH = 0;
const STAT_MAX_HP = 7;
const STAT_CARRY_WEIGHT = 12;
const STAT_CURRENT_HP = 35;
const SUBTYPE_ARMOR = 0;
const SUBTYPE_CONTAINER = 1;
const SUBTYPE_DRUG = 2;
const SUBTYPE_WEAPON = 3;
const SUBTYPE_AMMO = 4;
const SUBTYPE_KEY = 6;
/** Maksymalna odleglosc (heksy) do podnoszenia przedmiotu z ziemi i otwierania pojemnika. */
export const REACH_RANGE = 2;

const ok: CommandResult = { ok: true };
const fail = (reason: string): CommandResult => ({ ok: false, reason });

const qty = (o: GameObject): number => o.quantity ?? 1;

export const isItem = (o: GameObject): boolean => o.proto.kind === 'item';
export const subtypeOf = (o: GameObject): number =>
  o.proto.kind === 'item' ? o.proto.subtype : -1;
export const weightOf = (o: GameObject): number => (o.proto.kind === 'item' ? o.proto.weight : 0);
export const slotOf = (o: GameObject): EquipSlot | null =>
  o.flags & FLAG_LEFT_HAND
    ? 'left'
    : o.flags & FLAG_RIGHT_HAND
      ? 'right'
      : o.flags & FLAG_WORN
        ? 'armor'
        : null;

/** Waga stosu wraz z zawartoscia (pojemniki, plecaki). */
export function stackWeight(o: GameObject): number {
  const own = weightOf(o) * qty(o);
  return own + o.inventory.reduce((w, x) => w + stackWeight(x), 0);
}
export const inventoryWeight = (owner: GameObject): number =>
  owner.inventory.reduce((w, x) => w + stackWeight(x), 0);

export function carryMax(sheet: Pick<PlayerSheet, 'baseStats' | 'statBonuses'>): number {
  return (
    25 + 25 * (sheet.baseStats[STAT_STRENGTH] ?? 5) + (sheet.statBonuses[STAT_CARRY_WEIGHT] ?? 0)
  );
}

function categoryOf(o: GameObject): ItemCategory {
  switch (subtypeOf(o)) {
    case SUBTYPE_ARMOR:
      return 'armor';
    case SUBTYPE_DRUG:
      return 'drug';
    case SUBTYPE_WEAPON:
      return 'weapon';
    case SUBTYPE_AMMO:
      return 'ammo';
    case SUBTYPE_KEY:
      return 'quest';
    default:
      return 'misc';
  }
}

export interface WorldInventoryDeps {
  world: Pick<World, 'player' | 'map'>;
  sheet: () => PlayerSheet;
  /** Nazwa przedmiotu (pro_item.msg); brak = nazwa zastepcza z PID. */
  nameOf?: (o: GameObject) => string | undefined;
  /** FID rysunku postaci wg zalozonego pancerza (Z: tabela pancerz -> postac). */
  paperdollFid?: (armor: GameObject | null) => number;
  /** Nowy unikalny id dla obiektu powstalego przy podziale stosu. */
  allocId: () => number;
  /** Wolane po kazdej zmianie stanu (np. synchronizacja modelu skryptow). */
  onChange?: () => void;
  /** Stos wyrzucony na ziemie dostaje id (rejestr obiektow skryptow). */
  onDropped?: (o: GameObject) => void;
  /**
   * Uzycie leku na sobie (efekty opoznione, uzaleznienia, bramka AP w walce). Brak = uproszczone
   * efekty natychmiastowe. `consumed` = zuzyj jedna sztuke; `reason` przy odmowie.
   */
  useDrug?: (o: GameObject) => { ok: boolean; consumed?: boolean; reason?: string };
  /**
   * Uzycie dynamitu/plastiku (pid 0x33/0x55): host otwiera dialog czasu zapalnika; przedmiot
   * zostaje w ekwipunku (ustawienie ladunku zmienia jego pid i planuje wybuch).
   */
  useExplosive?: (
    o: GameObject,
    /** Wydziela jedna sztuke ze stosu (zostaje w ekwipunku) i zwraca ja; pojedynczy przedmiot zwraca bez zmian. */
    takeOne: () => GameObject,
  ) => { ok: boolean; reason?: string };
}

export interface WorldInventory {
  inventory: Signal<InventoryView>;
  container: Signal<ContainerView | null>;
  commands: InventoryCommands;
  /** Podnosi przedmiot z ziemi (zasieg REACH_RANGE, limit udzwigu). */
  pickup(o: GameObject): CommandResult;
  /** Otwiera pojemnik z mapy (zasieg REACH_RANGE). */
  openContainer(o: GameObject): CommandResult;
  /** Uzycie przedmiotu na sobie (opkod use_obj / przycisk Uzyj). */
  useOnSelf(o: GameObject): CommandResult;
  /** Wyrzuca stos na ziemie pod graczem (opkod drop_obj). */
  dropToGround(o: GameObject, count?: number): CommandResult;
  refresh(): void;
}

export function createWorldInventory(deps: WorldInventoryDeps): WorldInventory {
  const player = (): GameObject => deps.world.player;
  let box: GameObject | null = null;

  const viewOf = (o: GameObject): ItemView => {
    const p = o.proto.kind === 'item' ? o.proto : undefined;
    const sub = subtypeOf(o);
    const v: ItemView = {
      id: o.id,
      pid: o.pid,
      name: deps.nameOf?.(o) ?? `Przedmiot 0x${o.pid.toString(16)}`,
      fid: p?.invFid ?? 0,
      category: categoryOf(o),
      count: qty(o),
      weight: p?.weight ?? 0,
      value: p?.cost ?? 0,
      usable: sub === SUBTYPE_DRUG || (!!deps.useExplosive && isUnarmedExplosive(o)),
    };
    if (p && sub === SUBTYPE_WEAPON) {
      // Z (pro.md): 1 min, 2 max, 4 zasieg
      v.stats = { damageMin: p.data[1] ?? 0, damageMax: p.data[2] ?? 0, range: p.data[4] ?? 0 };
    } else if (p && sub === SUBTYPE_ARMOR) {
      // Z (pro.md): 1 DR normalny, 8 DT normalny
      v.stats = { dr: p.data[1] ?? 0, dt: p.data[8] ?? 0 };
    }
    return v;
  };

  const build = (): InventoryView => {
    const inv = player().inventory;
    const slot = (s: EquipSlot): ItemView | null => {
      const o = inv.find((x) => (x.flags & SLOT_FLAG[s]) !== 0);
      return o ? viewOf(o) : null;
    };
    const armor = inv.find((x) => (x.flags & FLAG_WORN) !== 0) ?? null;
    return {
      items: inv.filter((x) => (x.flags & EQUIP_MASK) === 0).map(viewOf),
      weight: inventoryWeight(player()),
      weightMax: carryMax(deps.sheet()),
      slots: { left: slot('left'), right: slot('right'), armor: slot('armor') },
      paperdollFid: deps.paperdollFid?.(armor) ?? 0,
    };
  };
  const buildBox = (): ContainerView | null =>
    box
      ? {
          id: box.id,
          name: deps.nameOf?.(box) ?? `Pojemnik 0x${box.pid.toString(16)}`,
          items: box.inventory.map(viewOf),
        }
      : null;

  const inventory = signal<InventoryView>(build());
  const container = signal<ContainerView | null>(null);
  const refresh = (): void => {
    inventory.value = build();
    container.value = buildBox();
  };
  const done = (r: CommandResult): CommandResult => {
    refresh();
    if (r.ok) deps.onChange?.();
    return r;
  };

  const free = (): number => carryMax(deps.sheet()) - inventoryWeight(player());

  /** Dodaje `count` sztuk (stos scalany po PID/skrypcie jak w InventoryModel). */
  const addTo = (dest: GameObject, it: GameObject, count: number): void => {
    const mergeable = (x: GameObject): boolean =>
      subtypeOf(x) !== SUBTYPE_CONTAINER &&
      x.inventory.length === 0 &&
      (x.flags & EQUIP_MASK) === 0;
    const same = mergeable(it)
      ? dest.inventory.find((x) => x.pid === it.pid && x.scriptId === it.scriptId && mergeable(x))
      : undefined;
    if (same) {
      same.quantity = qty(same) + count;
      return;
    }
    it.flags &= ~EQUIP_MASK;
    it.quantity = count;
    it.hex = -1;
    dest.inventory.push(it);
  };

  /** Zdejmuje `count` sztuk z listy wlasciciela; zwraca obiekt-stos do wstawienia (czesc albo calosc). */
  const takeFrom = (from: GameObject[], it: GameObject, count: number): GameObject => {
    if (count >= qty(it)) {
      from.splice(from.indexOf(it), 1);
      return it;
    }
    it.quantity = qty(it) - count;
    return {
      ...it,
      id: deps.allocId(),
      quantity: count,
      inventory: [],
      flags: it.flags & ~EQUIP_MASK,
    };
  };

  const clampCount = (it: GameObject, count: number): number =>
    Math.max(0, Math.min(count, qty(it)));

  const dist = (o: GameObject): number => (o.hex < 0 ? 0 : hexDistance(player().hex, o.hex));

  const dropToGround = (o: GameObject, count = qty(o)): CommandResult => {
    const inv = player().inventory;
    if (!inv.includes(o)) return fail('not-found');
    const n = clampCount(o, count);
    if (n <= 0) return fail('insufficient-count');
    const part = takeFrom(inv, o, n);
    part.flags &= ~EQUIP_MASK;
    part.quantity = n;
    part.elevation = player().elevation;
    deps.world.map.objects.push(part);
    moveObject(deps.world.map, part, player().hex, player().elevation);
    deps.onDropped?.(part);
    return done(ok);
  };

  const useOnSelf = (o: GameObject): CommandResult => {
    const inv = player().inventory;
    if (!inv.includes(o)) return fail('not-found');
    if (deps.useExplosive && isUnarmedExplosive(o)) {
      const takeOne = (): GameObject => {
        if (qty(o) <= 1) return o;
        const one = takeFrom(inv, o, 1);
        one.quantity = 1;
        inv.push(one);
        return one;
      };
      const r = deps.useExplosive(o, takeOne);
      return r.ok ? done(ok) : fail(r.reason ?? 'not-usable');
    }
    if (subtypeOf(o) !== SUBTYPE_DRUG || o.proto.kind !== 'item') return fail('not-usable');
    if (deps.useDrug) {
      const r = deps.useDrug(o);
      if (!r.ok) return fail(r.reason ?? 'not-usable');
      if (r.consumed !== false) takeFrom(inv, o, 1);
      return done(ok);
    }
    // Z: dane leku wg ukladu rules (0..2 statystyki, 3..5 natychmiastowe wartosci); efekty
    // opoznione i uzaleznienia (rules/item-use) nie sa jeszcze podpiete do swiata gry
    const d = o.proto.data;
    const sheet = deps.sheet();
    for (let i = 0; i < 3; i++) {
      const stat = d[i] ?? -1;
      const amount = (d[3 + i] ?? 0) | 0;
      if (stat < 0 || stat > 0xffff || amount === 0) continue;
      if (stat === STAT_CURRENT_HP) {
        const max = (sheet.baseStats[STAT_MAX_HP] ?? 0) + (sheet.statBonuses[STAT_MAX_HP] ?? 0);
        sheet.hp = Math.max(0, Math.min(Math.max(max, sheet.hp), sheet.hp + amount));
      } else if (stat < sheet.statBonuses.length) {
        sheet.statBonuses[stat] = (sheet.statBonuses[stat] ?? 0) + amount;
      }
    }
    takeFrom(inv, o, 1);
    return done(ok);
  };

  const equipTo = (itemId: number, slot: EquipSlot): CommandResult => {
    const inv = player().inventory;
    const o = inv.find((x) => x.id === itemId && (x.flags & EQUIP_MASK) === 0);
    if (!o) return fail('not-found');
    const sub = subtypeOf(o);
    const armor = sub === SUBTYPE_ARMOR;
    if (armor !== (slot === 'armor')) return fail('wrong-slot');
    if (
      !armor &&
      sub !== SUBTYPE_WEAPON &&
      sub !== SUBTYPE_DRUG &&
      sub !== SUBTYPE_AMMO &&
      sub !== 5
    )
      return fail('wrong-slot');
    // stos trafia do slotu w calosci (jedna sztuka), reszta zostaje w plecaku
    const one = qty(o) > 1 ? takeFrom(inv, o, 1) : o;
    for (const x of inv)
      if (x !== one && (x.flags & SLOT_FLAG[slot]) !== 0) x.flags &= ~SLOT_FLAG[slot];
    one.flags = (one.flags & ~EQUIP_MASK) | SLOT_FLAG[slot];
    if (one !== o) {
      one.quantity = 1;
      inv.push(one);
    }
    return done(ok);
  };

  const commands: InventoryCommands = {
    use(itemId) {
      const o = player().inventory.find((x) => x.id === itemId);
      return o ? done(useOnSelf(o)) : fail('not-found');
    },
    equip: equipTo,
    unequip(slot) {
      const o = player().inventory.find((x) => (x.flags & SLOT_FLAG[slot]) !== 0);
      if (!o) return fail('empty-slot');
      o.flags &= ~SLOT_FLAG[slot];
      // scal z ewentualnym stosem w plecaku
      const inv = player().inventory;
      inv.splice(inv.indexOf(o), 1);
      addTo(player(), o, qty(o));
      return done(ok);
    },
    drop(itemId, count) {
      const o = player().inventory.find((x) => x.id === itemId && (x.flags & EQUIP_MASK) === 0);
      return o ? dropToGround(o, count) : fail('not-found');
    },
    move(itemId, count, to) {
      if (!box) return fail('no-container');
      const from = to === 'container' ? player() : box;
      const dest = to === 'container' ? box : player();
      const o = from.inventory.find(
        (x) => x.id === itemId && !(from === player() && (x.flags & EQUIP_MASK) !== 0),
      );
      if (!o) return fail('not-found');
      const n = clampCount(o, count);
      if (n <= 0) return fail('insufficient-count');
      if (dest === player() && stackWeight({ ...o, quantity: n } as GameObject) > free())
        return fail('too-heavy');
      addTo(dest, takeFrom(from.inventory, o, n), n);
      return done(ok);
    },
    takeAll() {
      if (!box) return fail('no-container');
      let blocked: string | null = null;
      for (const o of [...box.inventory]) {
        if (stackWeight(o) > free()) {
          blocked = 'too-heavy';
          continue;
        }
        addTo(player(), takeFrom(box.inventory, o, qty(o)), qty(o));
      }
      return done(blocked && box.inventory.length > 0 ? fail(blocked) : ok);
    },
    closeContainer() {
      box = null;
      refresh();
    },
  };

  return {
    inventory,
    container,
    commands,
    pickup(o) {
      if (!isItem(o) || o.hex < 0) return fail('not-found');
      if (dist(o) > REACH_RANGE) return fail('too-far');
      if (stackWeight(o) > free()) return fail('too-heavy');
      const map = deps.world.map;
      moveObject(map, o, -1);
      map.objects = map.objects.filter((x) => x !== o);
      addTo(player(), o, qty(o));
      return done(ok);
    },
    openContainer(o) {
      // kontenery swiata: przedmioty podtypu pojemnik albo scenery z zawartoscia
      if (!isContainer(o)) return fail('not-container');
      if (dist(o) > REACH_RANGE) return fail('too-far');
      box = o;
      return done(ok);
    },
    useOnSelf,
    dropToGround,
    refresh,
  };
}
