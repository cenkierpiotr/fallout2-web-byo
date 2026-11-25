import { signal, type Signal } from '@preact/signals';
import type { ClockView, RestCommands, RestMode, RestResultView, RestView } from './types';

export interface MockRestOptions {
  enemiesNearby?: boolean;
  hp?: number;
  hpMax?: number;
  /** Przerwij kazdy odpoczynek po polowie czasu (do testow komunikatu). */
  interrupt?: boolean;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function addMinutes(c: ClockView, minutes: number): ClockView {
  let { year, month, day, hour, minute } = c;
  minute += minutes;
  hour += Math.floor(minute / 60);
  minute %= 60;
  day += Math.floor(hour / 24);
  hour %= 24;
  while (day > (MONTH_DAYS[month - 1] ?? 30)) {
    day -= MONTH_DAYS[month - 1] ?? 30;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return { year, month, day, hour, minute };
}

function hoursFor(mode: RestMode, c: ClockView, missing: number): number {
  if (typeof mode === 'object') return mode.hours;
  switch (mode) {
    case 'm10':
      return 1 / 6;
    case 'm30':
      return 0.5;
    case 'h1':
      return 1;
    case 'until-morning': {
      const diff = (6 * 60 - (c.hour * 60 + c.minute) + 1440) % 1440;
      return (diff === 0 ? 1440 : diff) / 60;
    }
    case 'until-healed':
      return (missing / 2) * 3;
  }
}

/** Atrapa magazynu odpoczynku (adapter GameView w apps/web); zegar sygnalem do Clock. */
export function createMockRest(opts: MockRestOptions = {}) {
  const clock: Signal<ClockView> = signal({ year: 2241, month: 7, day: 25, hour: 22, minute: 30 });
  const view: Signal<RestView> = signal({
    clock: clock.value,
    hp: opts.hp ?? 20,
    hpMax: opts.hpMax ?? 35,
    enemiesNearby: opts.enemiesNearby ?? false,
    lastResult: null,
  });
  const calls: RestMode[] = [];
  let closed = 0;
  const commands: RestCommands = {
    rest(mode) {
      calls.push(mode);
      const cur = view.value;
      let result: RestResultView;
      if (cur.enemiesNearby) {
        result = { ok: false, reason: 'enemies-nearby', hoursRested: 0, hpHealed: 0 };
      } else {
        const full = hoursFor(mode, clock.value, cur.hpMax - cur.hp);
        const rested = opts.interrupt ? full / 2 : full;
        clock.value = addMinutes(clock.value, Math.round(rested * 60));
        const healed = Math.min(cur.hpMax - cur.hp, Math.floor(rested / 3) * 2);
        result = opts.interrupt
          ? { ok: false, reason: 'interrupted', hoursRested: rested, hpHealed: healed }
          : { ok: true, hoursRested: rested, hpHealed: healed };
        view.value = { ...cur, hp: cur.hp + healed, clock: clock.value, lastResult: result };
        return;
      }
      view.value = { ...cur, lastResult: result };
    },
    close() {
      closed += 1;
    },
  };
  return { view, clock, commands, calls, closedCount: () => closed };
}
