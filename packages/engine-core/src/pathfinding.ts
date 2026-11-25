import { canPassDoor, type DoorPolicy } from './doors.js';
import { blockingObjects, objectsAt } from './game-map.js';
import type { GameMap } from './game-map.js';
import type { GameObject } from './game-object.js';
import { HEX_COUNT, hexInDirection, hexToWorld } from './hexgrid.js';
import type { Direction, Hex } from './hexgrid.js';
import { DEFAULT_RULES, type Rules } from './rules.js';

/** Koszt kroku i kara za zmiane kierunku (pathfinding.md sekcja 1, D). */
export const STEP_COST = 50;
export const TURN_PENALTY = 10;
/** Kara za wejscie krytera na heks z scenery o pid 0x20003d9..0x20003dc (D, 0x415efc). */
export const SCENERY_PENALTY_PID_MIN = 0x20003d9;
export const SCENERY_PENALTY_PID_MAX = 0x20003dc;
export const SCENERY_PENALTY = 400;
/** Dla typu zabicia 0xf kara jest mniejsza (D). */
export const SCENERY_PENALTY_KILLTYPE_F = 100;
/** Maksymalna dlugosc odtworzonej sciezki w oryginale (D). */
export const MAX_PATH_LENGTH = 800;

export interface FindPathOptions {
  /** Domyslnie 800 (spec). Dluzsza sciezka jest obcinana do pierwszych maxLength krokow. */
  maxLength?: number;
  rules?: Rules;
  /** Polityka przechodnich drzwi (Z: warunki 2, 3, 6 w specyfikacji). */
  doorPolicy?: DoorPolicy;
  /** Typ zabicia poruszajacego sie (proto +0x18c); 0xf obniza kare scenerii do 100. Domyslnie 0. */
  killType?: number;
  /** Gdy true i cel jest zablokowany, wynik null (flaga "sprawdz cel"). */
  checkTarget?: boolean;
}

interface Node {
  hex: Hex;
  parent: number; // indeks w tablicy wezlow, -1 dla startu
  dir: number;
  g: number;
  f: number;
  seq: number;
}

/** Kopiec binarny po (f, seq): remis wygrywa wezel wstawiony wczesniej (jak indeks 0 w oryginale). */
class Heap {
  private a: Node[] = [];
  get size(): number {
    return this.a.length;
  }
  private less(x: Node, y: Node): boolean {
    return x.f < y.f || (x.f === y.f && x.seq < y.seq);
  }
  push(n: Node): void {
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(a[i]!, a[p]!)) break;
      [a[i], a[p]] = [a[p]!, a[i]!];
      i = p;
    }
  }
  pop(): Node | undefined {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (top === undefined || last === undefined) return top;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l]!, a[m]!)) m = l;
        if (r < a.length && this.less(a[r]!, a[m]!)) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!];
        i = m;
      }
    }
    return top;
  }
}

/** Kara scenerii dla heksu kandydata (D, 0x415efc): tylko krytter, ta sama elewacja. */
export function sceneryPenalty(
  map: GameMap,
  elevation: number,
  hex: Hex,
  mover: GameObject,
  killType = 0,
): number {
  if (mover.type !== 1) return 0;
  for (const o of objectsAt(map, elevation, hex)) {
    if (o.pid >= SCENERY_PENALTY_PID_MIN && o.pid <= SCENERY_PENALTY_PID_MAX) {
      return killType === 0xf ? SCENERY_PENALTY_KILLTYPE_F : SCENERY_PENALTY;
    }
  }
  return 0;
}

function heuristic(a: Hex, b: Hex): number {
  const pa = hexToWorld(a);
  const pb = hexToWorld(b);
  const dx = Math.abs(pa.x - pb.x);
  const dy = Math.abs(pa.y - pb.y);
  return dx + dy - (Math.min(dx, dy) >> 1);
}

/**
 * Czy `mover` moze wejsc na heks: brak blokad albo wszystkie blokady to przechodnie drzwi.
 * (Cel jest przyjmowany zawsze przez findPath, nie przez te funkcje.)
 */
export function isPassableFor(
  map: GameMap,
  elevation: number,
  hex: Hex,
  mover: GameObject,
  policy: DoorPolicy = canPassDoor,
): boolean {
  const blockers = blockingObjects(map, elevation, hex, mover);
  return blockers.every((b) => policy(mover, b));
}

/**
 * A* wg pathfinding.md sekcja 1: odwiedzone oznaczane przy wstawieniu, sasiedzi 0..5, krok 50,
 * kara 10 za zmiane kierunku (start ma kierunek 0), heurystyka pikselowa, limit list, cel zawsze
 * przyjmowany. Zwraca heksy od pierwszego kroku do celu (bez `from`), albo null (brak sciezki,
 * przepelnienie list, `from === to` tez daje null; wywolujacy sprawdza sameHex wczesniej).
 */
export function findPath(
  map: GameMap,
  elevation: number,
  from: Hex,
  to: Hex,
  mover: GameObject,
  opts: FindPathOptions = {},
): Hex[] | null {
  if (from < 0 || from >= HEX_COUNT || to < 0 || to >= HEX_COUNT || from === to) return null;
  const rules = opts.rules ?? DEFAULT_RULES;
  const limit = rules.fixes.pathNodeLimit;
  const maxLength = opts.maxLength ?? MAX_PATH_LENGTH;
  const policy = opts.doorPolicy ?? canPassDoor;
  if (opts.checkTarget && !isPassableFor(map, elevation, to, mover, policy)) return null;

  const nodes: Node[] = [];
  const visited = new Uint8Array(HEX_COUNT);
  const open = new Heap();
  let seq = 0;
  const start: Node = { hex: from, parent: -1, dir: 0, g: 0, f: heuristic(from, to), seq: seq++ };
  visited[from] = 1;
  open.push(start);
  let closed = 0;

  for (;;) {
    const cur = open.pop();
    if (!cur) return null;
    const curIdx = nodes.length;
    nodes.push(cur);
    closed++;
    if (closed > limit) return null;
    if (cur.hex === to) break;
    for (let d = 0; d < 6; d++) {
      const nh = hexInDirection(cur.hex, d as Direction);
      if (nh < 0 || nh === cur.hex || visited[nh]) continue;
      if (nh !== to && !isPassableFor(map, elevation, nh, mover, policy)) continue;
      const g =
        cur.g +
        STEP_COST +
        (cur.dir !== d ? TURN_PENALTY : 0) +
        sceneryPenalty(map, elevation, nh, mover, opts.killType);
      visited[nh] = 1;
      open.push({ hex: nh, parent: curIdx, dir: d, g, f: g + heuristic(nh, to), seq: seq++ });
      if (open.size > limit) return null;
    }
  }

  const rev: Hex[] = [];
  let i = nodes.length - 1;
  while (i >= 0 && nodes[i]!.parent >= 0) {
    rev.push(nodes[i]!.hex);
    i = nodes[i]!.parent;
  }
  rev.reverse();
  return rev.length > maxLength ? rev.slice(0, maxLength) : rev;
}
