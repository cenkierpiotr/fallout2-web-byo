import { signal } from '@preact/signals';
import {
  MvePlayer,
  PcmStreamSource,
  type MovieFade,
  type MovieFrameOut,
  type MovieName,
  type MovieResult,
  type MovieSink,
  type PlayOptions,
} from '@f2/video';
import { MovieLibrary } from './movie-files';
import { playMissingFallback, skipMissingFallback } from './movie-fallback';

/** Biblioteka filmow wskazana przez uzytkownika (folder z *.mve/*.sve/*.cfg). */
export const movieLibrary = signal<MovieLibrary>(new MovieLibrary([]));

export interface MovieView {
  name: string;
  skippable: boolean;
}
/** Aktualnie wyswietlany film (null = ekran filmu ukryty). */
export const activeMovie = signal<MovieView | null>(null);
export const movieSubtitle = signal<string | null>(null);
export const movieFade = signal<MovieFade | null>(null);

export interface MovieDebug {
  name: string | null;
  frames: number;
  lastIndex: number;
  width: number;
  height: number;
  subtitle: string | null;
  audioChunks: number;
  result: MovieResult | null;
}

let canvas: HTMLCanvasElement | null = null;
let player: MvePlayer | null = null;
let debug: MovieDebug = emptyDebug();

function emptyDebug(): MovieDebug {
  return {
    name: null,
    frames: 0,
    lastIndex: -1,
    width: 0,
    height: 0,
    subtitle: null,
    audioChunks: 0,
    result: null,
  };
}

export function getMovieDebug(): MovieDebug {
  return { ...debug };
}

/** Plotno rejestruje MovieScreen po zamontowaniu. */
export function setMovieCanvas(c: HTMLCanvasElement | null): void {
  canvas = c;
}

/** Przerywa biezacy film (Esc, klik, przycisk). */
export function skipMovie(): void {
  player?.skip();
  skipMissingFallback();
}

function drawFrame(f: MovieFrameOut): void {
  if (!canvas) return;
  if (canvas.width !== f.width || canvas.height !== f.height) {
    canvas.width = f.width;
    canvas.height = f.height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // kopia: ImageData wymaga Uint8ClampedArray, a rgba jest widokiem na bufor dekodera
  const px = new Uint8ClampedArray(f.width * f.height * 4);
  px.set(f.rgba.subarray(0, px.length));
  ctx.putImageData(new ImageData(px, f.width, f.height), 0, 0);
}

function makeAudio(): PcmStreamSource | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    void ctx.resume().catch(() => {});
    return new PcmStreamSource(ctx);
  } catch {
    return null;
  }
}

/** Hook gry: odtwarza film (gmovie_play) i zwraca wynik. Brak filmu w bibliotece: 'missing'. */
export async function playMovie(name: MovieName, opts: PlayOptions = {}): Promise<MovieResult> {
  if (player) throw new Error('film juz odtwarzany');
  const audio = makeAudio();
  debug = { ...emptyDebug(), name };
  const sink: MovieSink = {
    frame(f) {
      drawFrame(f);
      movieFade.value = f.fade;
      debug.frames++;
      debug.lastIndex = f.index;
      debug.width = f.width;
      debug.height = f.height;
    },
    subtitle(text) {
      movieSubtitle.value = text;
      debug.subtitle = text;
    },
    audio(samples, rate, stereo) {
      debug.audioChunks++;
      audio?.push(samples, rate, stereo);
    },
  };
  const p = new MvePlayer({ load: (n) => movieLibrary.value.load(n), sink });
  player = p;
  movieSubtitle.value = null;
  movieFade.value = null;
  activeMovie.value = { name, skippable: opts.skippable ?? true };
  // pozwol Preactowi zamontowac plotno przed pierwsza klatka
  await new Promise<void>((r) => setTimeout(r, 0));
  let result: MovieResult = 'error';
  try {
    result = await p.play(name, opts);
  } finally {
    player = null;
    activeMovie.value = null;
    movieSubtitle.value = null;
    movieFade.value = null;
    void audio?.close();
    debug.result = result;
  }
  return result;
}

declare global {
  interface Window {
    __f2movie?: { play: typeof playMovie; debug: () => MovieDebug };
  }
}

// Haczyk diagnostyczny dla testow e2e (tylko DEV).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__f2movie = { play: playMovie, debug: getMovieDebug };
}

/** Wynik filmu -> wynik hooka VM (`play_gmovie`): film ogladany do konca albo przerwany liczy sie jako obejrzany. */
export function movieOutcome(r: MovieResult): 'played' | 'skipped' | 'missing' | 'error' {
  return r === 'finished' ? 'played' : r;
}

/**
 * Hook VM `play_gmovie` (0x8115): `file` z tabeli exe 0x518da0 (np. `derrick.mve`). Filmy bez pliku w bibliotece
 * (adestroy, car, cartucci, enclave) daja 'missing' i skrypt idzie dalej (brak flagi obejrzano).
 */
export async function playGameMovie(
  file: string,
): Promise<'played' | 'skipped' | 'missing' | 'error'> {
  try {
    const name = file.replace(/\.mve$/i, '') as MovieName;
    const outcome = movieOutcome(await playMovie(name));
    if (outcome === 'missing') await showMissingFallback(name);
    return outcome;
  } catch {
    return 'error';
  }
}

/** Plansza z tekstem zastepczym (4 filmy bez pliku w MASTER.DAT); wynik VM zostaje 'missing'. */
function showMissingFallback(name: string): Promise<void> {
  return playMissingFallback(name, {
    locale: () => (document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'pl'),
    show(text) {
      if (text === null) {
        activeMovie.value = null;
        movieSubtitle.value = null;
      } else {
        activeMovie.value = { name, skippable: true };
        movieSubtitle.value = text;
      }
    },
  });
}
