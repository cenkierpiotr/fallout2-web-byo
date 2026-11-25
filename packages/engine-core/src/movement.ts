import {
  canPassDoor,
  isDoor,
  isDoorOpen,
  toggleDoor,
  type DoorPolicy,
  type Result,
  fail,
  ok,
} from './doors.js';
import { blockingObjects, moveObject } from './game-map.js';
import type { GameMap } from './game-map.js';
import type { GameObject } from './game-object.js';
import { directionTo } from './hexgrid.js';
import type { Hex } from './hexgrid.js';
import { findPath } from './pathfinding.js';
import { DEFAULT_RULES, type Rules } from './rules.js';

export interface MovementState {
  path: Hex[];
  stepIndex: number;
  running: boolean;
  /** Klatka animacji w obrebie heksa (0..framesPerHex-1). */
  frame: number;
  animCode: 'AA' | 'AB' | 'AT';
}

/**
 * Tempo ruchu (pathfinding.md sekcja 4: Z, R8-U5). Jednostki: ticks GameClock (1/10 s).
 * Wartosci domyslne to szacunek, nie dane z oryginalu.
 */
export interface MovementTuning {
  ticksPerHexWalk: number;
  ticksPerHexRun: number;
  framesPerHex: number;
}

export const DEFAULT_TUNING: MovementTuning = {
  ticksPerHexWalk: 3,
  ticksPerHexRun: 1.5,
  framesPerHex: 4,
};

interface Internal extends MovementState {
  progress: number;
  goal: Hex;
}

/** Otwiera drzwi dla `mover`; true gdy drzwi po wywolaniu przepuszczaja. */
export type DoorOpener = (mover: GameObject, door: GameObject) => boolean;

export class MovementSystem {
  private readonly states = new Map<GameObject, Internal>();

  constructor(
    private map: GameMap,
    private readonly tuning: MovementTuning = DEFAULT_TUNING,
    private readonly rules: Rules = DEFAULT_RULES,
    readonly doorPolicy: DoorPolicy = canPassDoor,
    /**
     * Otwarcie drzwi przy wejsciu na ich heks (uzycie przez poruszajacego sie). Domyslnie surowe
     * przelaczenie; gracz w swiecie gry uzywa pelnego Uzyj (klucze, blokada zamykania).
     */
    private readonly openDoor: DoorOpener = (_obj, door) => toggleDoor(this.map, door).ok,
  ) {}

  /** Podmiana mapy po travelTo; przerywa wszystkie ruchy. */
  setMap(map: GameMap): void {
    this.map = map;
    this.states.clear();
  }

  start(obj: GameObject, path: Hex[], running: boolean): Result {
    if (this.states.has(obj)) return fail('busy');
    if (path.length === 0) return fail('noPath');
    this.states.set(obj, {
      path,
      stepIndex: 0,
      running,
      frame: 0,
      animCode: running ? 'AT' : 'AB',
      progress: 0,
      goal: path[path.length - 1]!,
    });
    return ok();
  }

  cancel(obj: GameObject): void {
    this.states.delete(obj);
  }

  stateOf(obj: GameObject): MovementState | undefined {
    return this.states.get(obj);
  }

  /**
   * Przesuwa obiekt o `dtTicks`. Wchodzenie na kolejne heksy: przechodnie zamkniete drzwi sa
   * otwierane (spec sekcja 3), inna blokada wymusza ponowne planowanie (puste = koniec ruchu).
   * Zwraca `arrived` gdy sciezka dobiegla konca, `enteredHex` = ostatnio wejsty heks w tym ticku.
   */
  tick(obj: GameObject, dtTicks: number): { arrived: boolean; enteredHex?: Hex } {
    const st = this.states.get(obj);
    if (!st) return { arrived: false };
    const per = st.running ? this.tuning.ticksPerHexRun : this.tuning.ticksPerHexWalk;
    st.progress += dtTicks;
    let entered: Hex | undefined;
    while (st.progress >= per) {
      const next = st.path[st.stepIndex];
      if (next === undefined) break;
      if (!this.clearFor(obj, next)) {
        const replanned = findPath(this.map, obj.elevation, obj.hex, st.goal, obj, {
          rules: this.rules,
          doorPolicy: this.doorPolicy,
        });
        if (!replanned || replanned.length === 0 || !this.clearFor(obj, replanned[0]!)) {
          this.states.delete(obj);
          return entered === undefined
            ? { arrived: false }
            : { arrived: false, enteredHex: entered };
        }
        st.path = replanned;
        st.stepIndex = 0;
        continue;
      }
      st.progress -= per;
      obj.rotation = directionTo(obj.hex, next);
      moveObject(this.map, obj, next);
      entered = next;
      st.stepIndex++;
      if (st.stepIndex >= st.path.length) {
        this.states.delete(obj);
        return { arrived: true, enteredHex: entered };
      }
    }
    st.frame = Math.min(
      this.tuning.framesPerHex - 1,
      Math.floor((st.progress / per) * this.tuning.framesPerHex),
    );
    return entered === undefined ? { arrived: false } : { arrived: false, enteredHex: entered };
  }

  /** Czy mozna wejsc na heks; po drodze otwiera przechodnie drzwi. */
  private clearFor(obj: GameObject, hex: Hex): boolean {
    const blockers = blockingObjects(this.map, obj.elevation, hex, obj);
    if (blockers.length === 0) return true;
    if (!blockers.every((b) => this.doorPolicy(obj, b))) return false;
    for (const b of blockers) {
      if (isDoor(b) && !isDoorOpen(b) && !this.openDoor(obj, b)) return false;
    }
    return blockingObjects(this.map, obj.elevation, hex, obj).length === 0;
  }
}
