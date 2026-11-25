import { MOVIE_FILES } from '@f2/vm';
import type { FlowScreen } from './flow';
import type { MidnightHost } from './midnight-host';
import { activeMovie, playGameMovie } from './play-movie';

/** Minimalny kontrakt GameFlow potrzebny hostowi polnocy. */
export interface MidnightFlow {
  screen: { readonly value: FlowScreen };
  endGame(): boolean;
}

type PlayFile = (file: string) => Promise<unknown>;

/**
 * Host polnocy dla aplikacji web: slajdy progow dni i film zakonczenia ida przez ekran filmow
 * (`playGameMovie`; brak pliku = 'missing' i plansza zastepcza), film trwa = `activeMovie`, koniec gry =
 * ekran inny niz 'playing'. Po filmie zakonczenia przeplyw przechodzi na ekran 'ending'.
 */
export function makeMidnightHost(
  flow: MidnightFlow,
  play: PlayFile = playGameMovie,
  movieActive: () => boolean = () => activeMovie.value !== null,
): MidnightHost {
  const run = (msg: number, then?: () => void): void => {
    const file = MOVIE_FILES[msg];
    const p = file ? play(file).catch(() => undefined) : Promise.resolve();
    if (then) void p.then(then);
  };
  return {
    moviePlaying: movieActive,
    gameEnded: () => flow.screen.value !== 'playing',
    showSlide: (msg) => run(msg),
    endGame: (msg) => run(msg, () => void flow.endGame()),
  };
}
