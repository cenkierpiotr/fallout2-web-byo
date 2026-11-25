import type { EventQueue, GameEvent } from './event-queue.js';
import type { GameClock } from './game-clock.js';
import type { MapRegistry } from './map-registry.js';
import type { MapStateJSON } from './save/schema.js';

/** Stale z dokumentacja techniczna */
export const TICKS_PER_HOUR = 36000;
export const MAP_UPDATE_INTERVAL = 600;

export type MapHook = 'map_exit' | 'map_enter' | 'map_update';

/** Port do zywej mapy i VM skryptow (implementowany przez gre; w testach w pamieci). */
export interface MapRuntime {
  exists(name: string): boolean;
  /** Biezacy stan zywej mapy jako JSON. */
  capture(): MapStateJSON;
  /** Laduje mape; saved != null => nalozyc zapisany stan zamiast swiezego. */
  load(name: string, saved: MapStateJSON | null): Promise<void>;
  callHook(hook: MapHook, args: { elapsedTicks?: number }): void;
  placePlayer(hex: number, elevation: number): void;
  /** f2_map_elapsed_update: leczenie krytereow, sprzatanie (time.md). */
  elapsedUpdate(hours: number): void;
  /** 0x49d4b8: obiekty dzienne, gdy nieobecnosc >= 24 h. */
  dailyObjects(): void;
}

export interface TransitionWorld {
  clock: GameClock;
  queue: EventQueue;
  currentMap: { name: string; elevation: number };
}

export interface TransitionCtx {
  registry: MapRegistry;
  runtime: MapRuntime;
}

export interface TransitionTarget {
  map: string;
  hex: number;
  elevation: number;
}

export type TransitionResult =
  { ok: true; firstVisit: boolean; elapsedTicks: number } | { ok: false; reason: 'map-not-found' };

export async function transitionTo(
  world: TransitionWorld,
  target: TransitionTarget,
  ctx: TransitionCtx,
): Promise<TransitionResult> {
  const { registry, runtime } = ctx;
  if (!runtime.exists(target.map)) return { ok: false, reason: 'map-not-found' };

  const now = world.clock.ticks;
  if (world.currentMap.name) {
    runtime.callHook('map_exit', {});
    registry.snapshot({ ...runtime.capture(), lastVisitTick: now });
  }
  world.queue.removeByKind('map-update');

  const saved = registry.get(target.map);
  await runtime.load(target.map, saved);
  world.currentMap = { name: target.map, elevation: target.elevation };
  runtime.placePlayer(target.hex, target.elevation);

  let elapsedTicks = 0;
  if (saved && now >= saved.lastVisitTick) {
    elapsedTicks = now - saved.lastVisitTick;
    const hours = elapsedTicks / TICKS_PER_HOUR;
    if (hours >= 24) runtime.dailyObjects();
    runtime.elapsedUpdate(hours);
  }
  runtime.callHook('map_enter', { elapsedTicks });
  world.queue.add({
    atTick: now + MAP_UPDATE_INTERVAL,
    kind: 'map-update',
    objId: 0,
    payload: null,
  });
  return { ok: true, firstVisit: !saved, elapsedTicks };
}

/** Handler zdarzenia 'map-update': wola hook i kolejkuje nastepne za 600 tickow. */
export function handleMapUpdate(
  e: GameEvent,
  world: Pick<TransitionWorld, 'clock' | 'queue'>,
  ctx: Pick<TransitionCtx, 'runtime'>,
): number {
  if (e.kind !== 'map-update') return 0;
  ctx.runtime.callHook('map_update', {});
  world.queue.add({
    atTick: world.clock.ticks + MAP_UPDATE_INTERVAL,
    kind: 'map-update',
    objId: 0,
    payload: null,
  });
  return 0;
}
