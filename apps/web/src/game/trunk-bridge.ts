import { FUEL_CELL_PID, type GameObject } from '@f2/engine-core';
import type { WorldmapController } from './worldmap/worldmap-controller';
import { FLAG_LEFT_HAND, FLAG_RIGHT_HAND, FLAG_WORN } from './save-world';

/** Przedmiot gracza mozliwy do wlozenia do bagaznika. */
export interface TrunkItem {
  id: number;
  pid: number;
  name: string;
  count: number;
}

/** Most miedzy bagaznikiem samochodu (CarState) a ekwipunkiem gracza. */
export interface TrunkBridge {
  /** Przedmioty niezalozone z ekwipunku gracza. */
  items(): TrunkItem[];
  /** Nazwa przedmiotu po PID (z ostatnio widzianych widokow ekwipunku), inaczej "#pid". */
  nameOf(pid: number): string;
  /** Przenosi `count` sztuk z ekwipunku do bagaznika; false gdy brak miejsca/auto nie stoi w obszarze. */
  stow(id: number, count: number): boolean;
  /** Zuzywa jedno ogniwo paliwa (PRO pid 288) z ekwipunku i dolewa paliwo; false gdy to nie ogniwo, bak pelny albo auto poza obszarem. */
  refuel(id: number): boolean;
  /**
   * Przenosi z bagaznika do ekwipunku; zwraca liczbe przeniesionych. Gdy udzwig gracza (limit wagi jak przy
   * podnoszeniu z ziemi) na to nie pozwala, odmawia: zwraca 0, a przedmioty zostaja w bagazniku.
   */
  retrieve(pid: number, count: number): number;
  /** Wczytuje proto.size dla przedmiotow bagaznika wczytanego z zapisu (inaczej licza sie po 1 na sztuke). */
  preload(): Promise<void>;
}

/** Minimalny widok ekwipunku sesji (WorldInventory + swiat) potrzebny mostowi. */
export interface TrunkBridgeDeps {
  ctl: WorldmapController;
  player: () => GameObject;
  /** Widok ekwipunku: nazwy i niezalozone przedmioty. */
  views: () => { id: number; pid: number; name: string; count: number }[];
  /** Tworzy przedmiot pod graczem i zwraca jego id (-1 = blad). */
  spawn: (pid: number) => number;
  /** Obiekt swiata po id. */
  object: (id: number) => GameObject | undefined;
  /** Podniesienie obiektu z ziemi do ekwipunku (limit udzwigu). */
  pickup: (o: GameObject) => { ok: boolean };
  /** Usuwa swiezo utworzony przedmiot (gdy gracz go nie udzwignie). */
  discard: (id: number) => void;
  refresh: () => void;
  /** Rozmiar sztuki z PRO dla pid spoza ekwipunku (np. zawartosc bagaznika z zapisu); brak = 1. */
  sizeOf?: (pid: number) => number | undefined;
  /** Asynchroniczny odczyt rozmiaru sztuki z PRO (ProtoCache.get); uzywany przez `preload`. */
  loadSize?: (pid: number) => Promise<number | undefined>;
}

/** Rozmiar przedmiotu z PRO (proto.size, tylko prototypy przedmiotow); undefined dla innych. */
function protoSize(o: GameObject): number | undefined {
  const p = o.proto as { kind?: string; size?: number } | undefined;
  return p?.kind === 'item' && typeof p.size === 'number' ? p.size : undefined;
}

const EQUIP_MASK = FLAG_LEFT_HAND | FLAG_RIGHT_HAND | FLAG_WORN;

export function createTrunkBridge(d: TrunkBridgeDeps): TrunkBridge {
  const names = new Map<number, string>();
  const sizes = new Map<number, number>();
  const learn = (): void => {
    for (const o of d.player().inventory) {
      const sz = protoSize(o);
      if (sz !== undefined) sizes.set(o.pid, sz);
    }
  };
  // pojemnosc bagaznika = suma proto.size (PRO pid 455: 250), nie liczba sztuk
  d.ctl.setTrunkSizeOf((pid) => sizes.get(pid) ?? d.sizeOf?.(pid) ?? 1);
  const items = (): TrunkItem[] => {
    learn();
    const v = d.views();
    for (const i of v) names.set(i.pid, i.name);
    return v;
  };
  return {
    items,
    nameOf: (pid) => names.get(pid) ?? `#${pid}`,
    async preload() {
      const load = d.loadSize;
      if (!load) return;
      const pids = (d.ctl.carStateInfo()?.trunk ?? [])
        .map((t) => t.pid)
        .filter((p) => !sizes.has(p));
      let changed = false;
      for (const pid of new Set(pids)) {
        try {
          const sz = await load(pid);
          if (sz !== undefined) {
            sizes.set(pid, sz);
            changed = true;
          }
        } catch {
          // brak prototypu: zostaje rozmiar domyslny 1
        }
      }
      if (changed) d.refresh();
    },
    stow(id, count) {
      if (!d.ctl.trunkAccessible()) return false;
      const inv = d.player().inventory;
      const o = inv.find((x) => x.id === id);
      if (!o || (o.flags & EQUIP_MASK) !== 0) return false;
      learn();
      const have = o.quantity ?? 1;
      const n = Math.max(0, Math.min(count, have));
      if (n <= 0 || !d.ctl.trunkStow(o.pid, n)) return false;
      if (n >= have) inv.splice(inv.indexOf(o), 1);
      else o.quantity = have - n;
      d.refresh();
      return true;
    },
    refuel(id) {
      if (!d.ctl.trunkAccessible()) return false;
      const inv = d.player().inventory;
      const o = inv.find((x) => x.id === id);
      if (!o || o.pid !== FUEL_CELL_PID || (o.flags & EQUIP_MASK) !== 0) return false;
      if (d.ctl.refuelCar(1) <= 0) return false;
      const have = o.quantity ?? 1;
      if (have <= 1) inv.splice(inv.indexOf(o), 1);
      else o.quantity = have - 1;
      d.refresh();
      return true;
    },
    retrieve(pid, count) {
      if (!d.ctl.trunkAccessible()) return 0;
      const n = d.ctl.trunkRetrieve(pid, count);
      if (n <= 0) return 0;
      const id = d.spawn(pid);
      const o = id >= 0 ? d.object(id) : undefined;
      if (!o) {
        if (id >= 0) d.discard(id);
        d.ctl.trunkStow(pid, n);
        return 0;
      }
      o.quantity = n;
      if (!d.pickup(o).ok) {
        // za ciezkie: nic nie zostaje pod graczem, przedmioty wracaja do bagaznika
        d.discard(id);
        d.ctl.trunkStow(pid, n);
        d.refresh();
        return 0;
      }
      d.refresh();
      return n;
    },
  };
}
