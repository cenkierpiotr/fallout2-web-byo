import type { DayThresholdIO, MidnightHooks } from '@f2/engine-core';

/**
 * Host polnocy (progi dni 0x4a3690, bramki 0x44eb14 / 0x444d2c; dokumentacja techniczna). Wszystko opcjonalne:
 * bez hosta polnoc robi tylko dzienny reset (jak dotad). Numer slajdu = indeks filmu z `MOVIE_FILES` (@f2/vm):
 * 0xc..0xf = artimer1..4, 4 = afailed (GVAR 7).
 */
export interface MidnightHost {
  /** [0x518e28]: trwa film/slajd; wtedy polnoc nic nie robi (D). */
  moviePlaying?(): boolean;
  /** [0x5186d4]: gra zakonczona/koncowka w toku; wtedy progi dni sa pomijane (D). */
  gameEnded?(): boolean;
  /** Pokazuje slajd progu dni (0xc..0xe); domyslnie no-op (sesja i tak oznacza go jako obejrzany). */
  showSlide?(msg: number): void;
  /** Sekwencja zakonczenia (msg 4 = GVAR 7, 0xf = dzien 360); domyslnie no-op. */
  endGame?(msg: number): void;
  /**
   * Skutek zdarzenia promieniowania (0x42d740): komunikaty (msg id), przerwanie czynnosci, smierc (surowy
   * SPECIAL <= 0). Domyslnie no-op; smierc gracza obsluguje host (Z: dokladny skutek w oryginale).
   */
  radiationEvent?(r: {
    level: number;
    messages: number[];
    interrupt: boolean;
    dead: boolean;
  }): void;
}

export interface GvarAccess {
  get(i: number): number;
  set(i: number, v: number): void;
}

export interface MidnightHooksDeps {
  host?: MidnightHost | undefined;
  /** GVAR-y skryptow (extras.globalAccess()); brak = progi dni wylaczone. */
  gvars?: GvarAccess | undefined;
  /** Flagi obejrzanych filmow (ScriptRuntime.movieFlags, 0x596c78); brak = progi dni wylaczone. */
  movieFlags?: Uint8Array | undefined;
  /** Trwala flaga 'gra zakonczona' (SessionState.gameEnded, zapisywana w save v6); brak = tylko do konca hooka. */
  ended?: { get(): boolean; set(v: boolean): void } | undefined;
  dailyReset(): void;
  /**
   * Promieniowanie na polnoc (0x42d4f4, D): `flag` to bit 0x2 [proto gracza+0x20] (ustawiany przy dawce netto > 0,
   * zawsze zerowany po tescie); `check(flagWas)` wola radiationMidnightCheck i kolejkuje zdarzenie typu 6.
   */
  radiation?:
    { flag: { get(): boolean; set(v: boolean): void }; check(flagWas: boolean): void } | undefined;
}

/**
 * Sklada `MidnightHooks` z hosta. Po zakonczeniu gry (endGame) `gameEnded` zostaje prawdziwe do konca sesji,
 * wiec kolejne polnoce nie powtarzaja sekwencji. Flaga zyje w `d.ended` (stan sesji) i jest zapisywana
 * w save (v6): wczytanie zapisu w stanie koncowym nie odpala zakonczenia ponownie (W).
 */
export function buildMidnightHooks(d: MidnightHooksDeps): MidnightHooks {
  const host = d.host;
  let localEnded = false;
  const ended = d.ended ?? { get: () => localEnded, set: (v: boolean) => void (localEnded = v) };
  const hooks: MidnightHooks = {
    dailyReset: d.dailyReset,
    moviePlaying: () => host?.moviePlaying?.() ?? false,
    gameEnded: () => ended.get() || (host?.gameEnded?.() ?? false),
  };
  const rad = d.radiation;
  if (rad) {
    hooks.radiation = () => {
      const was = rad.flag.get();
      rad.check(was);
      rad.flag.set(false);
    };
  }
  const { gvars, movieFlags } = d;
  if (gvars && movieFlags) {
    const io: DayThresholdIO = {
      gvar: (i) => gvars.get(i),
      setGvar: (i, v) => gvars.set(i, v),
      slideSeen: (msg) => (movieFlags[msg] ?? 0) !== 0,
      showSlide(msg) {
        movieFlags[msg] = 1;
        host?.showSlide?.(msg);
      },
      endGame(msg) {
        ended.set(true);
        movieFlags[msg] = 1;
        host?.endGame?.(msg);
      },
    };
    hooks.dayThresholds = io;
  }
  return hooks;
}
