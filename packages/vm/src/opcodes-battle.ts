import type { ExecContext, OpHandler, ScriptInstance } from './interpreter.js';
import { toInt, type Value } from './stack.js';

/**
 * Opkody walki (Zadanie M3-battle): critter_damage, attack, attack_setup, use_obj_on_obj, explosion.
 * Semantyka z deasemblacji handlerow (dokumentacja techniczna, sekcja "Badania M3-battle").
 * Argumenty zdejmowane od ostatniego do pierwszego; "brak obiektu" = id -1.
 */
export interface BattleHooks {
  /** critter_damage (0x80ef): `flags` = surowy 3. argument (typ obrazen w bitach 0..1 po masce 0xfffffcff, 0x100 = obrazenia wlasne). */
  critterDamage(id: number, damage: number, flags: number): void;
  /** attack (0x80d0): atakujacy = self_obj skryptu; `args` = 7 liczb po ofierze, w kolejnosci stosu. */
  attack(instance: ScriptInstance, victim: number, args: number[]): void;
  /** attack_setup (0x8143): zadanie rozpoczecia walki attacker -> defender (0x4a457c). */
  attackSetup(instance: ScriptInstance, attacker: number, defender: number): void;
  /** use_obj_on_obj (0x8145): uzytkownik = self_obj skryptu. */
  useObjOnObj(instance: ScriptInstance, item: number, target: number): void;
  /** explosion (0x811a): oryginal tylko zapisuje zadanie (0x4a4730); damage 0 = domyslne. */
  explosion(tile: number, elevation: number, damage: number): void;
  /** scr_return (0x80a2): zapisuje wartosc zwrotna skryptu ([script+0x28], D); konsument = Z. */
  scrReturn(instance: ScriptInstance, value: number): void;
  /** use_obj (0x80db): self_obj uzywa przedmiotu/obiektu (kryter: action_use_an_object 0x412114, inaczej obj_use 0x49c740). */
  useObj(instance: ScriptInstance, item: number): void;
  /** drop_obj (0x80d7): self_obj wyrzuca przedmiot na swoj kafel (0x49b8b0). */
  dropObj(instance: ScriptInstance, item: number): void;
  /** pickup_obj (0x80d6, handler 0x4564d4 -> 0x412134, D): self_obj podnosi przedmiot (pickup_p_proc moze nadpisac). */
  pickupObj?(instance: ScriptInstance, item: number): void;
}

const bt = (c: ExecContext): BattleHooks => c.hooks as unknown as BattleHooks;
const objId = (v: Value): number => (v.t === 'null' ? -1 : toInt(v));
const popObj = (c: ExecContext): number => objId(c.stack.pop());
const popInt = (c: ExecContext): number => c.stack.popInt();

const h = new Map<number, OpHandler>();

h.set(0x80ef, (c) => {
  const flags = popInt(c);
  const damage = popInt(c);
  const id = popObj(c);
  if (id === -1) c.fail('critter_damage: brak obiektu');
  bt(c).critterDamage(id, damage, flags);
});
h.set(0x80d0, (c) => {
  const args: number[] = [];
  for (let i = 0; i < 7; i++) args.unshift(popInt(c));
  const victim = popObj(c);
  if (victim === -1) c.fail('attack: brak obiektu');
  bt(c).attack(c.instance, victim, args);
});
h.set(0x8143, (c) => {
  const defender = popObj(c);
  const attacker = popObj(c);
  if (attacker === -1 || defender === -1) c.fail('attack_setup: brak obiektu');
  bt(c).attackSetup(c.instance, attacker, defender);
});
h.set(0x8145, (c) => {
  const target = popObj(c);
  const item = popObj(c);
  if (item === -1 || target === -1) c.fail('use_obj_on_obj: brak obiektu');
  bt(c).useObjOnObj(c.instance, item, target);
});
h.set(0x811a, (c) => {
  const damage = popInt(c);
  const elev = popInt(c);
  const tile = popInt(c);
  if (tile === -1) return; // oryginal: log "explosion: bad tile_num!", bez dzialania
  bt(c).explosion(tile, elev, damage);
});

h.set(0x80a2, (c) => {
  bt(c).scrReturn(c.instance, popInt(c));
});
h.set(0x80db, (c) => {
  const item = popObj(c);
  if (item === -1) c.fail('use_obj: brak obiektu');
  bt(c).useObj(c.instance, item);
});
h.set(0x80d7, (c) => {
  const item = popObj(c);
  if (item === -1) c.fail('drop_obj: brak obiektu');
  bt(c).dropObj(c.instance, item);
});
h.set(0x80d6, (c) => {
  const item = popObj(c);
  if (item === -1) c.fail('pickup_obj: brak obiektu');
  bt(c).pickupObj?.(c.instance, item);
});

export const battleHandlers: ReadonlyMap<number, OpHandler> = h;
