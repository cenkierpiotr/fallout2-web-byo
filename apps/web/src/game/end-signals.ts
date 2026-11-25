/** Minimalny kontrakt ScriptRuntime potrzebny do sygnalow konca gry. */
export interface EndSignalSource {
  endGameRequested: boolean;
  playerDeathRequested: boolean;
  clearEndSignals(): void;
}

export interface EndSignalFlow {
  die(reason?: string): boolean;
  endGame(): boolean;
}

/**
 * Obsluga zgloszen ze skryptow (metarule 13 SIGNAL_END_GAME, kill_critter na graczu):
 * smierc ma pierwszenstwo nad zakonczeniem. Zwraca 'death' / 'ending' / null.
 */
export function pollEndSignals(
  scripts: EndSignalSource | undefined,
  flow: EndSignalFlow,
  clock?: YearLimitClock,
): 'death' | 'ending' | 'timeout' | null {
  if (!scripts) return pollYearLimit(clock, flow);
  if (scripts.playerDeathRequested) {
    scripts.clearEndSignals();
    flow.die('script');
    return 'death';
  }
  if (scripts.endGameRequested) {
    scripts.clearEndSignals();
    flow.endGame();
    return 'ending';
  }
  return pollYearLimit(clock, flow);
}

/** Minimalny kontrakt GameClock: limit 13 lat gry (0x4a34ca). */
export interface YearLimitClock {
  readonly yearLimitReached: boolean;
}

/**
 * Limit czasu gry (D, 0x4a34ca): po 13 latach oryginal wola 0x440bd0 z powodem 2 i ustawia flage konca
 * [0x5186cc] = 2 (powrot do menu glownego). Tu: ekran smierci z powodem 'timeout' (EndgameFlow.runDeath(2):
 * film timeout.mve, potem losowanie narracji enddeath).
 * Oryginal sprawdza limit przy kazdym przesunieciu zegara (0x4a34cc): GameShell podpina te funkcje pod
 * `GameClock.onYearLimit` (zdarzeniowo); odpytywanie 300 ms zostaje tylko jako siatka dla sygnalow skryptow.
 */
export function pollYearLimit(
  clock: YearLimitClock | undefined,
  flow: EndSignalFlow,
): 'timeout' | null {
  if (!clock?.yearLimitReached) return null;
  return flow.die(TIMEOUT_REASON) ? 'timeout' : null;
}

export const TIMEOUT_REASON = 'timeout';
