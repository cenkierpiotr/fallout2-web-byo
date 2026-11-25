import type { Hooks as VmHooks, ScriptInstance } from './interpreter.js';
import type { Value } from './stack.js';

import type { DialogHooks } from './dialog-state.js';
export type { DialogHooks } from './dialog-state.js';

/**
 * Hooki gry dla opkodow gry/sfall (Zadanie 30+), implementowane w engine-core (Zadanie 32).
 * Rozszerza `Hooks` interpretera (kod wygrywa nad briefem: zmienne lokalne/mapy biora instancje,
 * getExternal/setExternal/nowMs/execScript itd. sa juz tam). Tu tylko dodatki z briefu Z29.
 */
export interface GameHooks extends VmHooks {
  objPid(id: number): number;
  objName(id: number): string;
  dudeObj(): number;
  objType(id: number): number;
  objHex(id: number): number;
  objElevation(id: number): number;
  moveTo(id: number, hex: number, elevation: number): void;
  animateMoveToHex(id: number, hex: number, run: boolean): void;
  animateStand(id: number): void;
  animateRotation(id: number, dir: number): void;
  tileDistance(a: number, b: number): number;
  tileInDirection(h: number, d: number, n: number): number;
  tileContainsObjPid(h: number, e: number, pid: number): number;
  /** Id pierwszego obiektu o pid na kaflu, -1 gdy brak (tile_contains_pid_obj 0x80a7). */
  tileObjByPid(h: number, e: number, pid: number): number;
  critterAddTrait(id: number, kind: number, trait: number, amount: number): number;
  getCritterStat(id: number, stat: number): number;
  setCritterStat(id: number, stat: number, v: number): number;
  floatMsg(id: number, text: string, color: number): void;
  displayMsg(text: string): void;
  messageStr(listId: number, msgId: number): string;
  random(min: number, max: number): number;
  gameTime(): number;
  gameTimeHour(): number;
  gameTicks(): number;
  /** Miesiac gry 1-12 (opkod 0x8118, w tabeli get_month; semantyka: miesiac, patrz Z35). */
  gameMonth(): number;
  /** Dzien miesiaca 1-31 (opkod 0x8119, w tabeli get_day). */
  gameDay(): number;
  /** has_trait(kind, obj, trait): kind 0 perk, 1 wlasciwosc obiektu, 2 trait postaci. */
  hasTrait(kind: number, id: number, trait: number): number;
  /** obj_art_fid: FID grafiki obiektu (-1 gdy brak obiektu). */
  objArtFid(id: number): number;
  /** Opoznienie wzgledne w tickach; host deleguje do Scheduler.addTimerEvent. */
  addTimerEvent(sid: number, ticks: number, fixedParam: number): void;
  rmTimerEvent(sid: number): void;
  protoData(pid: number, member: number): number;
  createObject(pid: number, hex: number, elevation: number, sid: number): number;
  destroyObject(id: number): void;
  loadMap(mapIndexOrName: number | string, startElevation: number): void;
  overrideMapStart(x: number, y: number, elevation: number, rotation: number): void;
  gfade(dir: 'in' | 'out', ms: number): void;
  playSfx(name: string): void;
  setLightLevel(v: number): void;
  dialog: DialogHooks;
  /** `instance` = skrypt wywolujacy (metarule 15 szuka windy wokol obiektu-wlasciciela). */
  metarule(id: number, arg: Value, instance?: ScriptInstance): Value;
  metarule3(id: number, a: Value, b: Value, c: Value): Value;
  /** sfall / nieobslugiwane: log + {t:'int',v:0}. */
  unsupported(opName: string, args: Value[]): Value;
}
