import { GameClock } from '../game-clock.js';
import { EventQueue } from '../event-queue.js';
import {
  MOVIE_FLAG_COUNT,
  SAVE_SCHEMA_VERSION,
  type SaveGame,
  type SaveMeta,
  type SaveWorld,
} from './schema.js';

const clone = <T>(v: T): T => structuredClone(v);

export function serializeWorld(w: SaveWorld, meta: SaveMeta): SaveGame {
  const {
    clock,
    queue,
    rng,
    globals,
    maps,
    modData,
    party,
    gvars,
    sfall,
    movieFlags,
    gameEnded,
    radiationFlag,
    ...world
  } = w;
  return clone({
    schemaVersion: SAVE_SCHEMA_VERSION,
    meta,
    world,
    // mapy losowych spotkan nigdy nie sa zapisywane (savegame-state.md)
    maps: maps.filter((m) => m.encounter !== true),
    queue: queue.serialize(),
    clock: clock.ticks,
    rng,
    globals,
    modData,
    party: party ?? null,
    gvars: gvars ?? null,
    ...(sfall ? { sfall } : {}),
    movieFlags: movieFlags ?? new Array<number>(MOVIE_FLAG_COUNT).fill(0),
    gameEnded: gameEnded === true,
    radiationFlag: radiationFlag === true,
  });
}

/**
 * Uwaga: po deserializeWorld `queue` jest NOWA instancja. Obiekty trzymajace stara kolejke
 * (np. EventQueueEffectPort) trzeba zbudowac ponownie nad `world.queue` (rebindEffectPort).
 */
export function deserializeWorld(save: SaveGame): SaveWorld {
  const s = clone(save);
  return {
    ...s.world,
    clock: new GameClock(s.clock),
    queue: EventQueue.restore(s.queue),
    rng: s.rng,
    globals: s.globals,
    maps: s.maps,
    modData: s.modData,
    ...(s.party ? { party: s.party } : {}),
    ...(s.gvars ? { gvars: s.gvars } : {}),
    ...(s.sfall ? { sfall: s.sfall } : {}),
    movieFlags: s.movieFlags,
    gameEnded: s.gameEnded,
    radiationFlag: s.radiationFlag,
  };
}
