import type { ExecContext, OpHandler } from './interpreter.js';
import { int, toInt, type Value } from './stack.js';

/**
 * Opkody "batch4" (Zadanie M3-batch4): krytery, flagi obrazen, ucieczka, statystyki PC, ekwipunek, rozstawienie.
 * Semantyka z deasemblacji handlerow (patrz `dokumentacja techniczna`, sekcja "Badania M3-batch4").
 * Silnik dostarcza port `Batch4Hooks`; host dokleja `batch4Handlers` PO `gameHandlers`.
 * Argumenty zdejmowane od ostatniego do pierwszego; "brak obiektu" = id -1 (na stosie {t:'null'}).
 */
export interface Batch4Hooks {
  /** critter_heal (0x80e8): leczy o `amount` HP, zwraca kod wyniku silnika (Z: znaczenie kodow). */
  critterHeal(id: number, amount: number): number;
  /** critter_state (0x80fb): 0 zdrowy, bity 0x7c okaleczenia, 1 martwy, 2 lezy/nieprzytomny; -1 = nie krytter. */
  critterState(id: number): number;
  /** critter_is_fleeing (0x8151): bit 0x400 pola +0x3c; -1 = brak krytera. */
  critterIsFleeing(id: number): number;
  critterSetFleeState(id: number, on: boolean): void;
  /** critter_injure (0x8127): ustawia (clear=false) albo zdejmuje (clear=true) flagi obrazen (maska 0x7c). */
  critterInjure(id: number, flags: number, clear: boolean): void;
  /** get_pc_stat (0x80a6): 0 pkt umiejetnosci, 1 poziom, 2 doswiadczenie, 3 reputacja, 4 karma (Z). */
  pcStat(stat: number): number;
  /** move_obj_inven_to_obj (0x8147): przenosi caly ekwipunek. */
  moveInventory(from: number, to: number): void;
  /** critter_attempt_placement (0x80ff): 0 = ok, -1 = porazka. */
  attemptPlacement(id: number, tile: number, elevation: number): number;
  /** anim (0x810c) / reg_anim_animate (0x810f): zadanie animacji (efekt wizualny po stronie hosta). */
  animate(id: number, code: number, arg: number): void;
}

const bh = (c: ExecContext): Batch4Hooks => c.hooks as unknown as Batch4Hooks;
const objId = (v: Value): number => (v.t === 'null' ? -1 : toInt(v));
const popObj = (c: ExecContext): number => objId(c.stack.pop());
const popInt = (c: ExecContext): number => c.stack.popInt();

export const DAMAGE_FLAG_MASK = 0x7c;
export const DAMAGE_CLEAR_BIT = 0x800000;

const h = new Map<number, OpHandler>();

h.set(0x80e8, (c) => {
  const amount = popInt(c);
  const id = popObj(c);
  if (id === -1) c.fail('critter_heal: brak obiektu');
  c.stack.push(int(bh(c).critterHeal(id, amount)));
});
h.set(0x80fb, (c) => {
  const id = popObj(c);
  // Oryginal 0x4585e8 (D): obiekt NULL lub nie-krytter => komunikat debug "obj is NULL" (0x453fd0, bez
  // przerwania skryptu) i wynik 1 (esi ustawione na 1 na wejsciu), nie blad VM.
  const r = id === -1 ? -1 : bh(c).critterState(id);
  c.stack.push(int(r === -1 ? 1 : r));
});
h.set(0x8151, (c) => {
  const id = popObj(c);
  const r = id === -1 ? -1 : bh(c).critterIsFleeing(id);
  if (r === -1) c.fail('critter_is_fleeing: brak krytera');
  c.stack.push(int(r));
});
h.set(0x8152, (c) => {
  const state = popInt(c);
  const id = popObj(c);
  if (id === -1) c.fail('critter_set_flee_state: brak krytera');
  bh(c).critterSetFleeState(id, state !== 0);
});
h.set(0x8127, (c) => {
  const raw = popInt(c);
  const id = popObj(c);
  if (id === -1) return; // oryginal: brak obiektu (test ebx) pomija dzialanie
  bh(c).critterInjure(id, raw & DAMAGE_FLAG_MASK, (raw & DAMAGE_CLEAR_BIT) !== 0);
});
h.set(0x80a6, (c) => c.stack.push(int(bh(c).pcStat(popInt(c)))));
h.set(0x8147, (c) => {
  const to = popInt(c);
  const from = popInt(c);
  bh(c).moveInventory(from, to);
});
h.set(0x80ff, (c) => {
  const elev = popInt(c);
  const tile = popInt(c);
  const id = popObj(c);
  if (id === -1) c.fail('critter_attempt_placement: brak obiektu');
  c.stack.push(int(bh(c).attemptPlacement(id, tile, elev)));
});
const anim: OpHandler = (c) => {
  const arg = popInt(c);
  const code = popInt(c);
  const id = popObj(c);
  if (id !== -1) bh(c).animate(id, code, arg);
};
h.set(0x810c, anim);
h.set(0x810f, anim);

export const batch4Handlers: ReadonlyMap<number, OpHandler> = h;
