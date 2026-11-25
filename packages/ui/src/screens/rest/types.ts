/**
 * Lokalne typy widoku odpoczynku i zegara. Odpowiadaja `RestMode`/`RestResult` z engine-core
 * (packages/engine-core/src/rest.ts) oraz `GameClock.date`; UI nie zalezy od engine-core.
 */

export type RestMode = 'm10' | 'm30' | 'h1' | 'until-morning' | 'until-healed' | { hours: number };

export type RestPresetId = 'm10' | 'm30' | 'h1' | 'until-morning' | 'until-healed';

export const REST_PRESETS: readonly RestPresetId[] = [
  'm10',
  'm30',
  'h1',
  'until-morning',
  'until-healed',
];

/** Zakres wlasnej liczby godzin w oknie odpoczynku. */
export const REST_CUSTOM_MIN = 1;
export const REST_CUSTOM_MAX = 72;

export interface RestResultView {
  ok: boolean;
  reason?: 'enemies-nearby' | 'interrupted';
  hoursRested: number;
  hpHealed: number;
}

/** Data i godzina gry (jak `GameClock.date`). */
export interface ClockView {
  year: number;
  /** 1-12 */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface RestView {
  clock: ClockView;
  hp: number;
  hpMax: number;
  enemiesNearby: boolean;
  /** Wynik ostatniego odpoczynku (null przed pierwszym). */
  lastResult: RestResultView | null;
}

export interface RestCommands {
  rest(mode: RestMode): void;
  close(): void;
}
