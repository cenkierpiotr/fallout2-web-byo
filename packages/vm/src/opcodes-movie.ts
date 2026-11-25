import type { ExecContext, OpHandler } from './interpreter.js';

/**
 * play_gmovie (0x8115, handler 0x45a14c, status D; dokumentacja techniczna, mve.md).
 * Oryginal: argument typu 0xC001 (int), numer -> nazwa pliku z tabeli 0x518da0 (17 wpisow, bez
 * sprawdzania zakresu w oryginale), odtwarzanie przez movie_play 0x44e690 (blokujace), po sukcesie
 * flaga obejrzano 0x596c78[numer] = 1 (slot zapisu 21). Blad odtwarzania: komunikat, bez flagi.
 */
export const MOVIE_FILES: readonly string[] = [
  'iplogo.mve',
  'intro.mve',
  'elder.mve',
  'vsuit.mve',
  'afailed.mve',
  'adestroy.mve',
  'car.mve',
  'cartucci.mve',
  'timeout.mve',
  'tanker.mve',
  'enclave.mve',
  'derrick.mve',
  'artimer1.mve',
  'artimer2.mve',
  'artimer3.mve',
  'artimer4.mve',
  'credits.mve',
];

/** played: odtworzono (takze przerwany przez gracza), missing: brak pliku, error: blad dekodowania. */
export type MovieOutcome = 'played' | 'skipped' | 'missing' | 'error';

export interface MovieHooks {
  /** Odtwarza film; Promise blokuje skrypt do konca filmu. */
  play(file: string, num: number): MovieOutcome | Promise<MovieOutcome>;
  /** Ustawia flage obejrzano (0x596c78[num] = 1). */
  markSeen(num: number): void;
}

const h = new Map<number, OpHandler>();

function finish(hooks: MovieHooks, num: number, o: MovieOutcome): void {
  if (o === 'played' || o === 'skipped') hooks.markSeen(num);
}

h.set(0x8115, (c: ExecContext) => {
  const num = c.stack.popInt();
  const hooks = (c.hooks as { movie?: MovieHooks }).movie;
  const file = MOVIE_FILES[num];
  if (!hooks || file === undefined) return;
  let r: MovieOutcome | Promise<MovieOutcome>;
  try {
    r = hooks.play(file, num);
  } catch {
    return;
  }
  if (typeof r === 'string') {
    finish(hooks, num, r);
    return;
  }
  const inst = c.instance;
  inst.suspendReason = 'movie';
  c.suspend();
  const done = (o: MovieOutcome): void => {
    finish(hooks, num, o);
    inst.suspendReason = undefined;
    c.interp.resume(inst);
  };
  r.then(done, () => done('error'));
});

export const movieHandlers: ReadonlyMap<number, OpHandler> = h;
