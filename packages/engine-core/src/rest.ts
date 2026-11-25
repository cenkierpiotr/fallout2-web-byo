import { GameClock } from './game-clock.js';
import type { EventQueue, GameEvent } from './event-queue.js';

export type RestMode = 'm10' | 'm30' | 'h1' | 'until-morning' | 'until-healed' | { hours: number };

export interface RestResult {
  ok: boolean;
  reason?: 'enemies-nearby' | 'interrupted' | 'invalid-hours';
  hoursRested: number;
  hpHealed: number;
}

/** Minimalny widok swiata potrzebny do odpoczynku (bez zaleznosci od packages/rules). */
export interface RestWorld {
  clock: GameClock;
  queue: EventQueue;
  enemiesNearby(): boolean;
  /** stat 14 gracza */
  healingRate(): number;
  hp(): number;
  maxHp(): number;
  heal(amount: number): void;
  /**
   * Opcjonalnie: leczenie calej druzyny (0x494eb8): dla kazdego czlonka typu 1 `hp_adjust(obj, stat14 * n)`.
   * Gdy podane, zastepuje `heal` (n = liczba "porcji" leczenia, czyli floor(minuty / 180)).
   */
  healParty?(n: number): void;
  /** Licznik minut od ostatniego leczenia (DAT 0x664518); przenoszony miedzy wywolaniami `rest`. */
  restMinutes?: number;
  /** Handler zdarzen kolejki; niezerowy wynik przerywa odpoczynek. */
  handleEvent(e: GameEvent): number;
}

const MORNING_HOUR = 6;

const HEAL_THRESHOLD_MINUTES = 180;
const UNTIL_HEALED_CHUNK_HOURS = 24;
const UNTIL_HEALED_MAX_PASSES = 3;

function fixedHours(mode: Exclude<RestMode, 'until-healed'>, w: RestWorld): number {
  if (typeof mode === 'object') return mode.hours;
  switch (mode) {
    case 'm10':
      return 1 / 6;
    case 'm30':
      return 0.5;
    case 'h1':
      return 1;
    case 'until-morning': {
      const minutesOfDay = Math.floor(w.clock.ticks / GameClock.TICKS_PER_MINUTE) % 1440;
      const target = MORNING_HOUR * 60;
      const diff = (target - minutesOfDay + 1440) % 1440;
      return (diff === 0 ? 1440 : diff) / 60;
    }
  }
}

/** Godziny potrzebne do pelnego wyleczenia (0x499a24: brakujace HP / healing rate * 3.0). */
function hoursToHeal(w: RestWorld): number {
  const missing = w.maxHp() - w.hp();
  const rate = w.healingRate();
  if (missing <= 0 || rate <= 0) return 0;
  return (missing / rate) * 3;
}

interface ChunkResult {
  stopped: boolean;
  rested: number;
}

/** Jeden odcinek odpoczynku: zegar + kolejka + licznik minut (leczenie przy >= 180 min). */
function restChunk(w: RestWorld, hours: number): ChunkResult {
  const start = w.clock.ticks;
  const end = start + Math.round(hours * GameClock.TICKS_PER_HOUR);
  let stopped = false;
  for (;;) {
    const next = w.queue.nextTime();
    if (next === null || next > end) break;
    w.clock.ticks = Math.max(w.clock.ticks, next + 1);
    if (w.queue.processUntil(next, w.handleEvent) !== 0) {
      stopped = true;
      break;
    }
  }
  // zegar nigdy nie cofa sie (zdarzenie dokladnie w `end` zostawia end + 1)
  if (!stopped) w.clock.ticks = Math.max(w.clock.ticks, end);
  const rested = (w.clock.ticks - start) / GameClock.TICKS_PER_HOUR;
  // 0x499fcc: licznik += minuty; przy >= 180 leczenie (reszta przechodzi na kolejne wywolanie, W)
  const total =
    (w.restMinutes ?? 0) + Math.floor((w.clock.ticks - start) / GameClock.TICKS_PER_MINUTE);
  const n = Math.floor(total / HEAL_THRESHOLD_MINUTES);
  w.restMinutes = total % HEAL_THRESHOLD_MINUTES;
  if (n > 0) {
    if (w.healParty) w.healParty(n);
    else w.heal(n * w.healingRate());
  }
  return { stopped, rested };
}

/**
 * Odpoczynek (spec time.md): przesuwa zegar, przetwarza kolejke, leczy co 180 min odpoczynku
 * (licznik minut w `w.restMinutes`). `until-healed` idzie kawalkami po 24 h, max 3 przebiegi (W).
 */
export function rest(w: RestWorld, mode: RestMode): RestResult {
  if (w.enemiesNearby())
    return { ok: false, reason: 'enemies-nearby', hoursRested: 0, hpHealed: 0 };
  if (typeof mode === 'object' && !(Number.isFinite(mode.hours) && mode.hours >= 0)) {
    return { ok: false, reason: 'invalid-hours', hoursRested: 0, hpHealed: 0 };
  }
  const hpBefore = w.hp();
  let rested = 0;
  let stopped = false;
  if (mode === 'until-healed') {
    for (let pass = 0; pass < UNTIL_HEALED_MAX_PASSES && !stopped; pass++) {
      const hours = Math.min(UNTIL_HEALED_CHUNK_HOURS, hoursToHeal(w));
      if (hours <= 0) break;
      const c = restChunk(w, hours);
      rested += c.rested;
      stopped = c.stopped;
    }
  } else {
    const c = restChunk(w, fixedHours(mode, w));
    rested = c.rested;
    stopped = c.stopped;
  }
  const hpHealed = w.hp() - hpBefore;
  return stopped
    ? { ok: false, reason: 'interrupted', hoursRested: rested, hpHealed }
    : { ok: true, hoursRested: rested, hpHealed };
}
