import type { BattleHooks, ScriptInstance } from '@f2/vm';
import type { GameObject } from './game-object.js';
import { critterDamage } from './critter-model.js';

export interface BattleRequest {
  kind: 'attack' | 'attackSetup' | 'explosion' | 'useObjOnObj' | 'useObj';
  /** attacker/uzytkownik (self_obj skryptu lub jawny argument); -1 = brak. */
  source: number;
  target: number;
  /** attack: 7 liczb ze stosu; explosion: [tile, elevation, damage]; use: [item]. Znaczenie pol attack = Z. */
  args: number[];
}

export interface BattleDeps {
  obj(id: number): GameObject | undefined;
  maxHp(o: GameObject): number;
  /** id wlasciciela skryptu (self_obj) albo -1. */
  selfOf(instance: ScriptInstance): number;
  /** Uruchamia use_obj_on_p_proc skryptu celu; true gdy skrypt nadpisal domyslne zachowanie. */
  runUseProc(source: number, item: number, target: number): boolean;
  /** Uruchamia use_p_proc skryptu obiektu `target` (uzywa `source`); true gdy skrypt nadpisal domyslne zachowanie. */
  runUseP(source: number, target: number): boolean;
  /**
   * Domyslne uzycie obiektu przez `source`, gdy use_p_proc celu nie nadpisal zachowania (exe: kryter ->
   * action_use_an_object 0x412114, inaczej obj_use 0x49c740). true = obsluzone (zadania nie zapisujemy).
   */
  defaultUse?(source: number, target: number): boolean;
  /** Wykonuje wybuch (typ 6) w kaflu; brak = tylko zapis zadania. Wykonanie od razu zamiast petli zadan walki = Z. */
  explode?(tile: number, elevation: number, damage: number): void;
  /** Podnosi przedmiot (pickup_obj, 0x412134): wynik 0 ok, -6 za ciezki (komunikat 0x389), -1 niepoprawny cel. */
  pickup?(source: number, item: number): number;
  /** Zapisuje wartosc zwrotna skryptu (scr_return). */
  setReturn(instance: ScriptInstance, value: number): void;
  /** drop_obj: zdejmuje przedmiot z ekwipunku wlasciciela i kladzie na jego kaflu; false gdy nie ma go w ekwipunku. */
  dropToGround(owner: number, item: number): boolean;
}

/** Implementacja `BattleHooks`. Zadania walki sa tylko zapisywane (silnik walki = M4, Z). */
export class BattleModel implements BattleHooks {
  readonly requests: BattleRequest[] = [];
  /** critter_damage: ile razy zadano obrazenia (log do testow/HUD). */
  readonly deaths: number[] = [];
  /** Wynik ostatniego pickup_obj (0 ok, -6 za ciezki, -1 niepoprawny cel). */
  lastPickup = 0;

  constructor(private readonly deps: BattleDeps) {}

  critterDamage(id: number, damage: number): void {
    const o = this.deps.obj(id);
    if (o && critterDamage(o, damage, this.deps.maxHp(o))) this.deaths.push(id);
  }
  attack(instance: ScriptInstance, victim: number, args: number[]): void {
    this.push({ kind: 'attack', source: this.deps.selfOf(instance), target: victim, args });
  }
  attackSetup(_instance: ScriptInstance, attacker: number, defender: number): void {
    this.push({ kind: 'attackSetup', source: attacker, target: defender, args: [] });
  }
  useObjOnObj(instance: ScriptInstance, item: number, target: number): void {
    const source = this.deps.selfOf(instance);
    if (this.deps.runUseProc(source, item, target)) return;
    this.push({ kind: 'useObjOnObj', source, target, args: [item] }); // domyslny efekt przedmiotu = Z
  }
  scrReturn(instance: ScriptInstance, value: number): void {
    this.deps.setReturn(instance, value);
  }
  useObj(instance: ScriptInstance, item: number): void {
    const source = this.deps.selfOf(instance);
    if (this.deps.runUseP(source, item)) return;
    if (this.deps.defaultUse?.(source, item)) return;
    this.push({ kind: 'useObj', source, target: item, args: [] }); // domyslny efekt uzycia (kryter: action_use_an_object) = Z
  }
  pickupObj(instance: ScriptInstance, item: number): void {
    const source = this.deps.selfOf(instance);
    if (source === -1) return;
    this.lastPickup = this.deps.pickup?.(source, item) ?? -1;
  }
  dropObj(instance: ScriptInstance, item: number): void {
    const owner = this.deps.selfOf(instance);
    if (owner === -1) return;
    this.deps.dropToGround(owner, item);
  }
  explosion(tile: number, elevation: number, damage: number): void {
    this.push({ kind: 'explosion', source: -1, target: -1, args: [tile, elevation, damage] });
    if (tile !== -1) this.deps.explode?.(tile, elevation, damage);
  }
  private push(r: BattleRequest): void {
    this.requests.push(r);
    if (this.requests.length > 256) this.requests.shift();
  }
}
