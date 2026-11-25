import type { ItemProto } from '@f2/formats';
import type { InventoryHooks } from '@f2/vm';
import type { GameMap } from './game-map.js';
import { indexObject, isHexBlocked, moveObject } from './game-map.js';
import { hexNeighbors } from './hexgrid.js';
import type { GameObject } from './game-object.js';
import type { PartyScriptPort } from './party/party-script-port.js';

/** PID kapsli (pro/items 41). */
export const PID_BOTTLE_CAPS = 41;
const TYPE_ITEM = 0;
const SUBTYPE_ARMOR = 0;
const SUBTYPE_CONTAINER = 1;
const SUBTYPE_WEAPON = 3;
const FIRST_INVENTORY_ID = 0x20000000;

export interface Equipment {
  worn?: GameObject;
  right?: GameObject;
  left?: GameObject;
}

/** Zaleznosci modelu: rejestr obiektow runtime'u (wspolny z ScriptRuntime), mapa, gracz. */
export interface InventoryDeps {
  objects: Map<number, GameObject>;
  currentMap(): GameMap;
  player(): GameObject;
  /** Aktywna reka gracza (0 lewa, 1 prawa); domyslnie 0 (0x45f7fc / ds:0x6610b8 w oryginale). */
  activeHand?(): number;
  /** Port druzyny (PartyState): limit, flagi 0x404, lista zapisywana. Bez portu: sam zbior id (M4). */
  party?: PartyScriptPort;
}

const qty = (o: GameObject): number => o.quantity ?? 1;

export function itemSubtypeOf(o: GameObject): number {
  if (o.type !== TYPE_ITEM) return -1;
  if (o.extra.kind === 'item') return o.extra.subtype;
  const p = o.proto as ItemProto | undefined;
  return p?.kind === 'item' ? p.subtype : -1;
}

/**
 * Model ekwipunku i druzyny (M4, wersja minimalna): ekwipunek = GameObject.inventory (zagniezdzone
 * pojemniki), stos = `quantity` (domyslnie 1), sloty rak/pancerza w `equipment`, druzyna = zbior id.
 * Nie liczy wagi, nie waliduje udzwigu, nie robi walki ani animacji zakladania.
 */
export class InventoryModel implements InventoryHooks {
  readonly party = new Set<number>();
  /** id obiektu swiata -> id czlonka w PartyState (pid & 0xffffff) + 18000; id swiata nie zmieniamy (Z). */
  private readonly stateIds = new Map<number, number>();
  readonly equipment = new Map<number, Equipment>();
  private nextId = FIRST_INVENTORY_ID;

  constructor(private readonly deps: InventoryDeps) {}

  /** Nadaje unikalne id i rejestruje przedmioty z ekwipunkow (rekurencyjnie) po wczytaniu mapy. */
  registerInventories(roots: Iterable<GameObject>): void {
    const walk = (o: GameObject): void => {
      for (const it of o.inventory) {
        this.register(it);
        walk(it);
      }
    };
    for (const o of roots) walk(o);
  }

  private register(it: GameObject): void {
    const known = this.deps.objects.get(it.id);
    if (known === it) return;
    if (known || it.id < 0) {
      while (this.deps.objects.has(this.nextId)) this.nextId++;
      it.id = this.nextId++;
    }
    this.deps.objects.set(it.id, it);
  }

  private obj(id: number): GameObject | undefined {
    return this.deps.objects.get(id);
  }

  private *walk(o: GameObject): Generator<GameObject> {
    for (const it of o.inventory) {
      yield it;
      yield* this.walk(it);
    }
  }

  /** Wlasciciel (kontener/krytyk lub mapa) przedmiotu z ekwipunku. */
  private ownerOf(item: GameObject, root: GameObject): GameObject | undefined {
    if (root.inventory.includes(item)) return root;
    for (const it of this.walk(root)) if (it.inventory.includes(item)) return it;
    return undefined;
  }

  // ---- druzyna ----
  partyMemberObj(pid: number): number {
    for (const id of this.party) if (this.obj(id)?.pid === pid) return id;
    return -1;
  }
  partyAdd(id: number): void {
    const o = this.obj(id);
    if (!o || id === this.deps.player().id) return;
    // 0x494378: ten sam wskaznik LUB ten sam PID => bez zmian (brak duplikatu).
    for (const m of this.party) if (this.obj(m)?.pid === o.pid) return;
    const port = this.deps.party;
    if (port) {
      const r = port.partyAdd({ objId: id, pid: o.pid, flags: o.flags });
      if (r.code !== 1) return; // -1 limit, 0 duplikat/DENIED
      if (r.flags !== undefined) o.flags = r.flags;
      if (r.objId !== undefined) this.stateIds.set(id, r.objId);
    }
    this.party.add(id);
  }
  /** Id wpisu PartyState dla obiektu swiata (klucz rozkazow); brak = id obiektu. */
  partyStateId(id: number): number {
    return this.stateIds.get(id) ?? id;
  }
  partyRemove(id: number): void {
    if (!this.party.delete(id)) return;
    const port = this.deps.party;
    const sid = this.stateIds.get(id);
    this.stateIds.delete(id);
    const o = this.obj(id);
    if (!port || sid === undefined) return;
    const r = port.partyRemove(sid, o?.flags);
    if (o && r.flags !== undefined) o.flags = r.flags;
  }

  /** Obiekty swiata czlonkow druzyny (bez gracza). */
  partyObjects(): GameObject[] {
    const out: GameObject[] = [];
    for (const id of this.party) {
      const o = this.obj(id);
      if (o) out.push(o);
    }
    return out;
  }

  /** Zdejmuje towarzyszy z biezacej mapy (przed jej opuszczeniem), by nie trafili do jej migawki. */
  detachParty(): GameObject[] {
    const map = this.deps.currentMap();
    const out = this.partyObjects();
    for (const o of out) {
      moveObject(map, o, -1);
      map.objects = map.objects.filter((x) => x !== o);
    }
    return out;
  }

  /** Stawia towarzyszy z poprzedniej mapy przy graczu na biezacej (nowe id przy kolizji z id mapy). */
  attachParty(members: readonly GameObject[]): void {
    const map = this.deps.currentMap();
    const player = this.deps.player();
    for (const o of members) {
      if (this.deps.objects.has(o.id) && this.deps.objects.get(o.id) !== o) {
        const old = o.id;
        while (this.deps.objects.has(this.nextId)) this.nextId++;
        o.id = this.nextId++;
        if (this.party.delete(old)) this.party.add(o.id);
        const sid = this.stateIds.get(old);
        if (sid !== undefined) {
          this.stateIds.delete(old);
          this.stateIds.set(o.id, sid);
        }
      }
      o.elevation = player.elevation;
      o.hex = -1;
      const hex = this.freeHexNear(map, player.elevation, player.hex, o);
      o.hex = hex;
      map.objects.push(o);
      indexObject(map, o);
      this.deps.objects.set(o.id, o);
    }
  }

  private freeHexNear(map: GameMap, el: number, from: number, o: GameObject): number {
    const seen = new Set<number>([from]);
    let ring = [from];
    for (let r = 0; r < 5; r++) {
      const next: number[] = [];
      for (const h of ring)
        for (const n of hexNeighbors(h)) {
          if (seen.has(n)) continue;
          seen.add(n);
          next.push(n);
          if (!isHexBlocked(map, el, n, o)) return n;
        }
      ring = next;
    }
    return from;
  }

  /**
   * Po wczytaniu zapisu: odtwarza zbior druzyny skryptow z wpisow PartyState (indeks >= 1) przez
   * dopasowanie pid krytera na biezacej mapie. Zwraca liczbe dopasowanych.
   */
  rebindParty(entries: readonly { objId: number; pid: number }[]): number {
    this.party.clear();
    this.stateIds.clear();
    const map = this.deps.currentMap();
    let n = 0;
    for (const e of entries.slice(1)) {
      const o = map.objects.find((x) => x.type === 1 && x.pid === e.pid && !this.party.has(x.id));
      if (!o) continue;
      this.deps.objects.set(o.id, o);
      this.party.add(o.id);
      this.stateIds.set(o.id, e.objId);
      n++;
    }
    return n;
  }

  // ---- zapytania ----
  invenCountPid(who: number, pid: number): number {
    const o = this.obj(who);
    if (!o) return 0;
    let n = 0;
    for (const it of this.walk(o)) if (it.pid === pid) n += qty(it);
    return n;
  }
  invenObjByPid(who: number, pid: number): number {
    const o = this.obj(who);
    if (!o) return -1;
    for (const it of this.walk(o)) if (it.pid === pid) return it.id;
    return -1;
  }
  invenSlotObj(who: number, slot: number): number {
    const e = this.equipment.get(who);
    // 0x471c08/0x471b70/0x471bbc: gracz widzi tylko przedmiot aktywnej reki (slot 1 gdy hand != 0,
    // slot 2 gdy hand == 0); pozostali krytycy: obie rece.
    const hand = who === this.deps.player().id ? (this.deps.activeHand?.() ?? 0) : -1;
    let it: GameObject | undefined;
    if (slot === 0) it = e?.worn;
    else if (slot === 1) it = hand === 0 ? undefined : e?.right;
    else if (slot === 2) it = hand > 0 ? undefined : e?.left;
    return it ? it.id : -1;
  }
  invenCount(who: number): number {
    return this.obj(who)?.inventory.length ?? 0;
  }
  itemSubtype(id: number): number {
    const o = this.obj(id);
    return o ? itemSubtypeOf(o) : -1;
  }

  // ---- modyfikacje ----
  /** Dodaje przedmiot (zdejmuje z mapy); stos tego samego PID scala sie z istniejacym. */
  addObjToInven(who: number, item: number): void {
    const owner = this.obj(who);
    const it = this.obj(item);
    if (!owner || !it || owner === it) return;
    // 0x4563b4 add_obj_to_inven: przedmiot juz trzymany w inwentarzu jest odrzucany
    if (this.isHeld(it)) return;
    this.detach(it);
    this.insert(owner, it);
  }

  /** 0x459b5c: count < 0 => 1, > 99999 => 500, 0 => bez zmian; ilosc ustawiana na przedmiocie. */
  addMultObjsToInven(who: number, item: number, count: number): void {
    const it = this.obj(item);
    if (!it) return;
    let n = count;
    if (n < 0) n = 1;
    else if (n > 99999) n = 500;
    if (n < 1) return;
    it.quantity = n;
    this.addObjToInven(who, item);
  }

  rmObjFromInven(who: number, item: number): void {
    const owner = this.obj(who);
    const it = this.obj(item);
    if (!owner || !it) return;
    const holder = this.ownerOf(it, owner);
    if (!holder) return;
    holder.inventory.splice(holder.inventory.indexOf(it), 1);
    this.unequip(who, it);
  }

  /** 0x45a2d4: po tozsamosci obiektu (nie PID); wynik = min(ilosc obiektu, count). */
  rmMultObjsFromInven(who: number, item: number, count: number): number {
    const owner = this.obj(who);
    const it = this.obj(item);
    if (!owner || !it || count <= 0) return 0;
    const holder = this.ownerOf(it, owner);
    if (!holder) return 0;
    const take = Math.min(count, qty(it));
    if (take === qty(it)) this.rmObjFromInven(who, it.id);
    else it.quantity = qty(it) - take;
    return take;
  }

  wieldObjCritter(who: number, item: number): void {
    const owner = this.obj(who);
    const it = this.obj(item);
    if (!owner || !it || !this.ownerOf(it, owner)) return;
    const sub = itemSubtypeOf(it);
    const e = this.equipment.get(who) ?? {};
    if (sub === SUBTYPE_ARMOR) e.worn = it;
    else if (sub === SUBTYPE_WEAPON) e.right = it;
    else return;
    this.equipment.set(who, e);
  }

  itemCapsTotal(id: number): number {
    return this.invenCountPid(id, PID_BOTTLE_CAPS);
  }
  /**
   * 0x45b588: ujemne = zdejmuje po stosach (takze w pojemnikach), -1 gdy total < -amount;
   * dodatnie = dolicza do pierwszego istniejacego stosu (takze zagniezdzonego) lub tworzy nowy.
   */
  itemCapsAdjust(id: number, amount: number): number {
    const owner = this.obj(id);
    if (!owner) return -1;
    if (amount < 0) {
      if (this.itemCapsTotal(id) < -amount) return -1;
      let left = -amount;
      for (const it of [...this.walk(owner)]) {
        if (left === 0) break;
        if (it.pid !== PID_BOTTLE_CAPS) continue;
        left -= this.rmMultObjsFromInven(id, it.id, left);
      }
      return 0;
    }
    if (amount === 0) return 0;
    const existing = [...this.walk(owner)].find((it) => it.pid === PID_BOTTLE_CAPS);
    if (existing) existing.quantity = qty(existing) + amount;
    else {
      const caps: GameObject = {
        id: -1,
        pid: PID_BOTTLE_CAPS,
        fid: 0,
        type: TYPE_ITEM,
        hex: -1,
        elevation: owner.elevation,
        rotation: 0,
        frame: 0,
        flags: 0,
        protoFlags: 0,
        scriptId: -1,
        localVars: new Int32Array(0),
        inventory: [],
        proto: undefined as never,
        extra: { kind: 'item', subtype: 5, flags: 0, raw: new Int32Array(0) },
        hidden: false,
        quantity: amount,
      };
      this.register(caps);
      owner.inventory.push(caps);
    }
    return 0;
  }

  // ---- pomocnicze ----
  private isHeld(it: GameObject): boolean {
    const map = this.deps.currentMap();
    return [this.deps.player(), ...map.objects].some((h) => this.ownerOf(it, h) !== undefined);
  }

  private detach(it: GameObject): void {
    const map = this.deps.currentMap();
    if (it.hex >= 0 || map.objects.includes(it)) {
      moveObject(map, it, -1);
      map.objects = map.objects.filter((x) => x !== it);
    }
    for (const holder of [this.deps.player(), ...map.objects]) {
      const owner = this.ownerOf(it, holder);
      if (owner) {
        owner.inventory.splice(owner.inventory.indexOf(it), 1);
        break;
      }
    }
    for (const id of this.equipment.keys()) this.unequip(id, it);
  }

  /** inven_unwield (0x812c): zdejmuje przedmiot z reki (gracz: aktywna reka, reszta: prawa). */
  unwieldHand(who: number): void {
    const e = this.equipment.get(who);
    if (!e) return;
    const hand = who === this.deps.player().id ? (this.deps.activeHand?.() ?? 0) : 1;
    if (hand === 0) delete e.left;
    else delete e.right;
  }

  /** inven_cmds 13 (0x472740): przedmiot pod indeksem w ekwipunku, -1 gdy brak. */
  invenIndexPtr(who: number, index: number): number {
    return this.obj(who)?.inventory[index]?.id ?? -1;
  }

  private unequip(who: number, it: GameObject): void {
    const e = this.equipment.get(who);
    if (!e) return;
    if (e.worn === it) delete e.worn;
    if (e.right === it) delete e.right;
    if (e.left === it) delete e.left;
  }

  private insert(owner: GameObject, it: GameObject): void {
    const mergeable = (x: GameObject): boolean =>
      itemSubtypeOf(x) !== SUBTYPE_CONTAINER &&
      x.inventory.length === 0 &&
      ((x.flags >>> 24) & 7) === 0;
    const same = mergeable(it)
      ? owner.inventory.find((x) => x.pid === it.pid && x.scriptId === it.scriptId && mergeable(x))
      : undefined;
    if (same) {
      same.quantity = qty(same) + qty(it);
      if (this.deps.objects.get(it.id) === it) this.deps.objects.delete(it.id);
      return;
    }
    it.hex = -1;
    owner.inventory.push(it);
  }
}
