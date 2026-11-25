import { critterRestoreState, critterSnapshot } from './critter-model.js';
import type { GameMap } from './game-map.js';
import { indexObject } from './game-map.js';
import type { GameObject } from './game-object.js';
import type { Direction } from './hexgrid.js';
import type { MapStateJSON, SaveMapObject } from './save/schema.js';

/** Wpis skryptu potrzebny do zapisu zmiennych lokalnych (podzbior ScriptEntry z @f2/vm). */
export interface ScriptLocalsEntry {
  sid: number;
  localVars: Int32Array;
}

export interface TimerRecord {
  sid: number;
  atTick: number;
  fixedParam: number;
}

export interface CaptureEnv {
  playerId: number;
  /** maksimum HP krytera (proto/stat); do leczenia po nieobecnosci */
  maxHp(o: GameObject): number;
  scripts: Iterable<ScriptLocalsEntry>;
  timers: readonly TimerRecord[];
}

function toSaveObject(o: GameObject, env: CaptureEnv): SaveMapObject {
  const base: SaveMapObject = {
    objId: o.id,
    pid: o.pid,
    hex: o.hex,
    orientation: o.rotation,
    flags: o.flags,
    hp: 0,
    scriptLocalId: o.scriptId >= 0 ? o.scriptId : null,
    inventory: [],
  };
  const c = critterSnapshot(o);
  if (c) {
    const max = env.maxHp(o) | 0;
    base.maxHp = max;
    base.hp = c.hp ?? max;
    base.dmgFlags = c.flags;
  }
  return base;
}

/** Pelna migawka zywej mapy: obiekty (z HP krytera), zmienne mapy, zmienne lokalne skryptow, timery. */
export function captureLiveMapState(map: GameMap, tick: number, env: CaptureEnv): MapStateJSON {
  const elevations = [0, 1, 2].map((e) => ({
    objects: map.objects
      .filter((o) => o.elevation === e && o.id !== env.playerId)
      .map((o) => toSaveObject(o, env)),
  }));
  const scriptLocals: Record<string, number[]> = {};
  for (const s of env.scripts) scriptLocals[String(s.sid)] = Array.from(s.localVars);
  return {
    name: map.name,
    lastVisitTick: tick,
    mapVars: Array.from(map.localVars),
    mvars: Array.from(map.globalVars),
    scriptLocals,
    elevations,
    timers: env.timers.map((t) => ({ ...t })),
  };
}

/**
 * Synchroniczne odtworzenie obiektow zywej mapy: obiekty istniejace (po objId + pid) dostaja
 * pozycje, flagi, rotacje; obiekty nieobecne w zapisie (zniszczone, podniesione) znikaja.
 * Obiekty nowe (np. upuszczone) i ekwipunek wymagaja prototypow: robi to opcjonalny hook hosta
 * (ScriptRuntimeOptions.restoreObjects). HP i flagi obrazen krytera wraca zawsze.
 */
export function restoreLiveObjects(map: GameMap, state: MapStateJSON, playerId: number): void {
  const byId = new Map<number, GameObject>();
  for (const o of map.objects) byId.set(o.id, o);
  const next: GameObject[] = [];
  for (const [e, el] of state.elevations.entries()) {
    for (const so of el.objects) {
      const live = byId.get(so.objId);
      if (!live || live.pid !== so.pid || so.objId === playerId) continue;
      live.hex = so.hex;
      live.elevation = e as 0 | 1 | 2;
      live.rotation = (so.orientation % 6) as Direction;
      live.flags = so.flags;
      live.hidden = (so.flags & 1) !== 0;
      if (so.maxHp !== undefined) critterRestoreState(live, so.hp, so.dmgFlags ?? 0);
      next.push(live);
    }
  }
  const player = byId.get(playerId);
  map.objects = player ? [...next, player] : next;
  map.byHex.clear();
  for (const o of map.objects) indexObject(map, o);
  if (state.mapVars.length) map.localVars = Int32Array.from(state.mapVars);
  if (state.mvars?.length) map.globalVars = Int32Array.from(state.mvars);
}

/** Nadpisuje zmienne lokalne wpisu zapisanymi (gdy dlugosc sie zgadza). Zwraca true gdy zastosowano. */
export function applySavedLocals(entry: ScriptLocalsEntry, state: MapStateJSON): boolean {
  const saved = state.scriptLocals[String(entry.sid)];
  if (!saved || saved.length === 0) return false;
  if (entry.localVars.length < saved.length) return false;
  entry.localVars.set(saved);
  return true;
}
