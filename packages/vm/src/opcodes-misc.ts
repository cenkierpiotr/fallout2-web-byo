import type { ExecContext, OpHandler, ScriptInstance } from './interpreter.js';
import { int, toInt, type Value } from './stack.js';

/**
 * Opkody flag/mapy/blokad/UI (Zadanie M3-misc). Semantyka z deasemblacji handlerow (specyfikacja formatu,
 * patrz `dokumentacja techniczna`, sekcja "Badania M3-misc"). Silnik dostarcza port `MiscHooks`;
 * host dokleja `miscHandlers` PO `gameHandlers` (nadpisuja zastepniki `unsupported`).
 * "Brak obiektu" = id -1 po stronie hookow, {t:'null'} na stosie.
 */
export interface MiscHooks {
  /** script_overrides (0x80b9): ustawia flage nadpisania domyslnej akcji w skrypcie (+0x44 = 1). */
  scriptOverrides(instance: ScriptInstance): void;
  /** cur_map_index (0x8101): indeks biezacej mapy. */
  curMapIndex(): number;
  /** rotation_to_tile (0x814c): kierunek 0..5 z kafla a do b. */
  tileDirection(a: number, b: number): number;
  /** set_obj_visibility (0x80e3): hide=true ukrywa obiekt. */
  setObjHidden(id: number, hide: boolean): void;
  objIsLocked(id: number): number;
  setObjLocked(id: number, locked: boolean): void;
  objIsOpen(id: number): number;
  setObjOpen(id: number, open: boolean): void;
  /** game_time_advance (0x80fc): przesuwa zegar gry o `ticks` (1/10 s). */
  gameTimeAdvance(ticks: number): void;
  /** game_ui_disable / game_ui_enable (0x8133, 0x8134). */
  setUiEnabled(on: boolean): void;
  /** mouse_state_flag (0x8128): maska przyciskow myszy (bit 0 = lewy). */
  mouseButtons(): number;
  /** script_action (0x80c7): pole script+0x2c. */
  scriptAction(): number;
  /** obj_being_used_with (0x80c0): pole script+0x3c, -1 gdy brak. */
  objBeingUsedWith(): number;
}

const mh = (c: ExecContext): MiscHooks => c.hooks as unknown as MiscHooks;
const objId = (v: Value): number => (v.t === 'null' ? -1 : toInt(v));
const popObj = (c: ExecContext): number => objId(c.stack.pop());
const popInt = (c: ExecContext): number => c.stack.popInt();
const pushObj = (c: ExecContext, id: number): void =>
  c.stack.push(id === -1 ? { t: 'null' } : { t: 'obj', v: id });

/** Poziomy rzutu: 0 krytyczna porazka, 1 porazka, 2 sukces, 3 krytyczny sukces. */
export const ROLL_SUCCESS = 2;

const h = new Map<number, OpHandler>();

h.set(0x80b9, (c) => mh(c).scriptOverrides(c.instance));
h.set(0x8101, (c) => c.stack.push(int(mh(c).curMapIndex())));
h.set(0x814c, (c) => {
  const b = popInt(c);
  const a = popInt(c);
  c.stack.push(int(mh(c).tileDirection(a, b)));
});
h.set(0x80e3, (c) => {
  const flag = popInt(c);
  const id = popObj(c);
  if (id === -1) c.fail('set_obj_visibility: brak obiektu');
  mh(c).setObjHidden(id, flag !== 0);
});
h.set(0x80c0, (c) => pushObj(c, mh(c).objBeingUsedWith()));
h.set(0x80c7, (c) => c.stack.push(int(mh(c).scriptAction())));
h.set(0x8128, (c) => c.stack.push(int(mh(c).mouseButtons() & 1)));
h.set(0x8133, (c) => mh(c).setUiEnabled(false));
h.set(0x8134, (c) => mh(c).setUiEnabled(true));
h.set(0x80fc, (c) => mh(c).gameTimeAdvance(popInt(c)));

// blokady / otwarcie
h.set(0x812d, (c) => c.stack.push(int(mh(c).objIsLocked(popObj(c)))));
h.set(0x812e, (c) => mh(c).setObjLocked(popObj(c), true));
h.set(0x812f, (c) => mh(c).setObjLocked(popObj(c), false));
h.set(0x814d, (c) => mh(c).setObjLocked(popObj(c), true));
h.set(0x8130, (c) => c.stack.push(int(mh(c).objIsOpen(popObj(c)))));
h.set(0x8131, (c) => mh(c).setObjOpen(popObj(c), true));
h.set(0x8132, (c) => mh(c).setObjOpen(popObj(c), false));

// wyniki rzutow
h.set(0x80af, (c) => c.stack.push(int(popInt(c) >= ROLL_SUCCESS ? 1 : 0)));
h.set(0x80b0, (c) => {
  const r = popInt(c);
  c.stack.push(int(r === 0 || r === 3 ? 1 : 0));
});

export const miscHandlers: ReadonlyMap<number, OpHandler> = h;
