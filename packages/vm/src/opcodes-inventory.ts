import type { ExecContext, OpHandler } from './interpreter.js';
import { int, toInt, type Value } from './stack.js';

/**
 * Opkody ekwipunku i druzyny (Zadanie M4-inv). Semantyka wg uzyc w skryptach i nazw w
 * `dokumentacja techniczna` (nazwy z heurystyki: status Z dla arg/wyniku; spec nie opisuje
 * wnetrz handlerow). Silnik dostarcza model przez port `InventoryHooks`; tu tylko stos.
 * Host dokleja `inventoryHandlers` PO `gameHandlers` (nadpisuja zastepniki `unsupported`).
 *
 * Konwencja: "brak obiektu" = id -1 po stronie hookow, {t:'null'} na stosie.
 */
export interface InventoryHooks {
  /** party_member_obj(pid): obiekt czlonka druzyny o danym PID lub -1. */
  partyMemberObj(pid: number): number;
  /** party_add(obj) / party_remove(obj). */
  partyAdd(id: number): void;
  partyRemove(id: number): void;
  /** obj_is_carrying_obj_pid(who, pid): liczba sztuk (z zagniezdzonymi pojemnikami), 0 gdy brak. */
  invenCountPid(who: number, pid: number): number;
  /** obj_carrying_pid_obj(who, pid): pierwszy pasujacy przedmiot lub -1. */
  invenObjByPid(who: number, pid: number): number;
  /** critter_inven_obj(who, slot): slot 0 pancerz, 1 prawa reka, 2 lewa reka; -1 brak. */
  invenSlotObj(who: number, slot: number): number;
  /** critter_inven_obj(who, -2): liczba pozycji ekwipunku. */
  invenCount(who: number): number;
  addObjToInven(who: number, item: number): void;
  rmObjFromInven(who: number, item: number): void;
  addMultObjsToInven(who: number, item: number, count: number): void;
  /** Zwraca liczbe faktycznie usunietych sztuk. */
  rmMultObjsFromInven(who: number, item: number, count: number): number;
  /** wield_obj_critter(who, item): zaklada przedmiot (bron/pancerz) do odpowiedniego slotu. */
  wieldObjCritter(who: number, item: number): void;
  /** op_item_subtype: 0 pancerz .. 6 klucz; -1 gdy to nie przedmiot / brak obiektu. */
  itemSubtype(id: number): number;
  /** item_caps_total(obj): suma kapsli w ekwipunku. */
  itemCapsTotal(id: number): number;
  /** item_caps_adjust(obj, amount): zwraca 0 gdy OK, -1 gdy za malo kapsli przy ujemnej zmianie. */
  itemCapsAdjust(id: number, amount: number): number;
}

const ih = (c: ExecContext): InventoryHooks => c.hooks as unknown as InventoryHooks;
const objId = (v: Value): number => (v.t === 'null' ? -1 : toInt(v));
const popObj = (c: ExecContext): number => objId(c.stack.pop());
const popInt = (c: ExecContext): number => c.stack.popInt();
const pushObj = (c: ExecContext, id: number): void =>
  c.stack.push(id === -1 ? { t: 'null' } : { t: 'obj', v: id });

export const INVEN_SLOT_COUNT = -2;

const h = new Map<number, OpHandler>();

h.set(0x814b, (c) => pushObj(c, ih(c).partyMemberObj(popInt(c))));
h.set(0x8124, (c) => ih(c).partyAdd(popObj(c)));
h.set(0x8125, (c) => ih(c).partyRemove(popObj(c)));
h.set(0x80ba, (c) => {
  const pid = popInt(c);
  c.stack.push(int(ih(c).invenCountPid(popObj(c), pid)));
});
h.set(0x810d, (c) => {
  const pid = popInt(c);
  pushObj(c, ih(c).invenObjByPid(popObj(c), pid));
});
h.set(0x8106, (c) => {
  const slot = popInt(c);
  const who = popObj(c);
  if (slot === INVEN_SLOT_COUNT) c.stack.push(int(ih(c).invenCount(who)));
  else if (slot < INVEN_SLOT_COUNT || slot === -1 || slot > 2)
    c.stack.push(int(0)); // 0x455470: blad skryptu, wynik 0
  else pushObj(c, ih(c).invenSlotObj(who, slot));
});
h.set(0x80d8, (c) => {
  const item = popObj(c);
  ih(c).addObjToInven(popObj(c), item);
});
h.set(0x80d9, (c) => {
  const item = popObj(c);
  ih(c).rmObjFromInven(popObj(c), item);
});
h.set(0x8116, (c) => {
  const n = popInt(c);
  const item = popObj(c);
  ih(c).addMultObjsToInven(popObj(c), item, n);
});
h.set(0x8117, (c) => {
  const n = popInt(c);
  const item = popObj(c);
  c.stack.push(int(ih(c).rmMultObjsFromInven(popObj(c), item, n)));
});
h.set(0x80da, (c) => {
  const item = popObj(c);
  ih(c).wieldObjCritter(popObj(c), item);
});
h.set(0x80c9, (c) => c.stack.push(int(ih(c).itemSubtype(popObj(c)))));
h.set(0x8138, (c) => c.stack.push(int(ih(c).itemCapsTotal(popObj(c)))));
h.set(0x8139, (c) => {
  const amount = popInt(c);
  c.stack.push(int(ih(c).itemCapsAdjust(popObj(c), amount)));
});

/** Opkody ekwipunku/druzyny z jawna implementacja (dla licznika statusu i testow). */
export const inventoryHandlers: ReadonlyMap<number, OpHandler> = h;
export const implementedInventoryOpcodes: ReadonlySet<number> = new Set(h.keys());
