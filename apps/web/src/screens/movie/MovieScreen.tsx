import { useEffect, useRef } from 'preact/hooks';
import { t } from '../../i18n';
import {
  activeMovie,
  movieFade,
  movieSubtitle,
  setMovieCanvas,
  skipMovie,
} from '../../game/play-movie';

/** Pelnoekranowy odtwarzacz filmow MVE: obraz, napisy SVE, zaciemnienie, pomijanie. */
export function MovieScreen() {
  const movie = activeMovie.value;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!movie) return;
    setMovieCanvas(canvasRef.current);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        skipMovie();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      setMovieCanvas(null);
    };
  }, [movie?.name]);

  if (!movie) return null;
  const fade = movieFade.value;
  const subtitle = movieSubtitle.value;
  return (
    <div
      class="movie-screen"
      role="dialog"
      aria-label={t('movie.title', { name: movie.name })}
      data-testid="movie-screen"
      data-movie={movie.name}
      onClick={() => skipMovie()}
    >
      <canvas ref={canvasRef} class="movie-canvas" data-testid="movie-canvas" />
      <div
        class="movie-fade"
        data-testid="movie-fade"
        style={{
          background: fade ? `rgb(${fade.color[0]},${fade.color[1]},${fade.color[2]})` : 'none',
          opacity: fade ? String(fade.amount) : '0',
        }}
      />
      {subtitle && (
        <p class="movie-subtitle" data-testid="movie-subtitle" aria-live="polite">
          {subtitle}
        </p>
      )}
      {movie.skippable && (
        <button
          type="button"
          class="movie-skip"
          data-testid="movie-skip"
          onClick={(e) => {
            e.stopPropagation();
            skipMovie();
          }}
        >
          {t('movie.skip')}
        </button>
      )}
    </div>
  );
}
