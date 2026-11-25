import type { GameMap } from './game-map.js';
import type { GameObject } from './game-object.js';

/** Wynik operacji gracza/silnika (bez wyjatkow dla przewidywalnych odmow). */
export type Result =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'blocked'
        | 'noPath'
        | 'outOfMap'
        | 'busy'
        | 'sameHex'
        | 'tooFar'
        | 'noScript'
        | 'noDialog'
        | 'badOption'
        | 'scriptError';
    };

const OK: Result = { ok: true };
export const ok = (): Result => OK;
export const fail = (reason: Exclude<Result, { ok: true }>['reason']): Result => ({
  ok: false,
  reason,
});

const FLAG_NO_BLOCK = 0x10;
/** Bity `extra.raw[0]` drzwi (Z: wartosci z konwencji pliku MAP, nie z dekompilacji). */
export const DOOR_OPEN_BIT = 0x1;
export const DOOR_LOCKED_BIT = 0x2;
const TYPE_SCENERY = 2;
const TYPE_CRITTER = 1;

export function isDoor(obj: GameObject): boolean {
  return obj.type === TYPE_SCENERY && obj.extra.kind === 'door';
}

function doorBits(obj: GameObject): number {
  const e = obj.extra;
  return e.kind === 'door' ? (e.raw[0] ?? 0) : 0;
}

export function isDoorOpen(obj: GameObject): boolean {
  return isDoor(obj) && ((doorBits(obj) & DOOR_OPEN_BIT) !== 0 || obj.frame > 0);
}

export function isDoorLocked(obj: GameObject): boolean {
  return isDoor(obj) && (doorBits(obj) & DOOR_LOCKED_BIT) !== 0;
}

/**
 * Otwiera/zamyka drzwi: przelacza bit otwarcia, klatke (0 zamkniete, 1 otwarte) i NoBlock.
 * Zamkniete na klucz: {ok:false, reason:'blocked'}. Nie drzwi: 'noPath'.
 * `map` zarezerwowane (hooki skryptow/swiatla w M3).
 */
export function toggleDoor(_map: GameMap, door: GameObject): Result {
  if (!isDoor(door)) return fail('noPath');
  if (isDoorLocked(door)) return fail('blocked');
  const e = door.extra;
  if (e.kind !== 'door') return fail('noPath');
  if (e.raw.length === 0) e.raw = new Int32Array(1);
  const opening = !isDoorOpen(door);
  if (opening) {
    e.raw[0] = (e.raw[0] ?? 0) | DOOR_OPEN_BIT;
    door.frame = 1;
    door.flags |= FLAG_NO_BLOCK;
  } else {
    e.raw[0] = (e.raw[0] ?? 0) & ~DOOR_OPEN_BIT;
    door.frame = 0;
    door.flags &= ~FLAG_NO_BLOCK;
  }
  return OK;
}

/**
 * Czy zablokowane drzwi sa przechodnie dla poruszajacego sie (pathfinding.md sekcja 3).
 * Warunki D: mover to krytera, blokujacy to scenery-drzwi, nie zamkniete na klucz.
 * Warunki Z (flaga 4 w proto dla gracza, stan poruszajacego sie, typ zabicia 0xf) sa
 * parametryzowane przez `extra`; domyslnie pomijane.
 */
export type DoorPolicy = (mover: GameObject, blocker: GameObject) => boolean;

export const canPassDoor: DoorPolicy = (mover, blocker) =>
  mover.type === TYPE_CRITTER && isDoor(blocker) && !isDoorLocked(blocker);

/** Cechy krytera potrzebne do warunkow drzwi z make_path 0x415e24 (D). */
export interface DoorMoverTraits {
  /** Proto krytera +0x184: 0 humanoid, 1 czworonog, 2 robot (0x42ddc4). */
  bodyType: number;
  /** Proto krytera +0x18c (0x42d920); dla gracza zawsze 0 lub 1. */
  killType: number;
  isPlayer: boolean;
}

/** Typ zabicia 0xf wylacza przechodzenie przez drzwi i daje kare 100 zamiast 400 (D, 0x415e24/0x415efc). */
export const KILL_TYPE_NO_DOORS = 0xf;
/** Bit 4 w bajcie proto scenery +0x24 (= pierwsze slowo danych drzwi z pliku PRO, 0x4a0fa0). */
export const DOOR_PROTO_PLAYER_PASS_BIT = 0x4;

/**
 * Polityka drzwi wg 0x415e24 (D): mover krytter, blokujacy scenery-drzwi (podtyp 0), nie zamkniety
 * na klucz (0x49d1c8); typ ciala 0 lub 2; typ zabicia != 0xf; gracz dodatkowo wymaga bitu 4
 * w proto drzwi (`protoFlags`, pierwsze slowo danych PRO; W: we wszystkich 98 drzwiach = 0,
 * wiec w exe gracz nigdy nie wchodzi w drzwi sam, tylko je uzywa; web: polityka gracza w apps/web/src/game/door-policy.ts + otwarcie w MovementSystem.clearFor).
 */
export function makeDoorPolicy(
  traits: (mover: GameObject) => DoorMoverTraits,
  protoFlags: (door: GameObject) => number = () => 0,
): DoorPolicy {
  return (mover, blocker) => {
    if (!canPassDoor(mover, blocker)) return false;
    const t = traits(mover);
    if (t.bodyType !== 0 && t.bodyType !== 2) return false;
    if (t.killType === KILL_TYPE_NO_DOORS) return false;
    if (t.isPlayer && (protoFlags(blocker) & DOOR_PROTO_PLAYER_PASS_BIT) === 0) return false;
    return true;
  };
}
