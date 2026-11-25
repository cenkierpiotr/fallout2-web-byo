import { useEffect, useRef } from 'preact/hooks';
import type { MovieName } from '@f2/video';
import { t } from '../../i18n';
import { MovieLibrary } from '../../game/movie-files';
import { movieLibrary, playMovie } from '../../game/play-movie';

/** Wybor folderu z filmami i lista do odtworzenia. */
export function MovieShelf() {
  const inputRef = useRef<HTMLInputElement>(null);
  const names = movieLibrary.value.names();
  // Preact ustawia nieznana wlasciwosc jako property, a potrzebny jest atrybut
  useEffect(() => inputRef.current?.setAttribute('webkitdirectory', ''), []);
  return (
    <section class="movie-shelf" data-testid="movie-shelf" aria-label={t('movie.shelf')}>
      <label class="movie-pick">
        {t('movie.pick')}
        <input
          ref={inputRef}
          type="file"
          multiple
          data-testid="pick-movies-input"
          onChange={() => {
            const files = Array.from(inputRef.current?.files ?? []);
            movieLibrary.value = new MovieLibrary(
              files.map((f) => ({
                name: f.webkitRelativePath || f.name,
                arrayBuffer: () => f.arrayBuffer(),
              })),
            );
          }}
        />
      </label>
      {names.length > 0 && (
        <span class="movie-list" data-testid="movie-list" data-count={names.length}>
          {names.map((n) => (
            <button
              type="button"
              key={n}
              data-testid={`movie-play-${n}`}
              onClick={() => void playMovie(n as MovieName)}
            >
              {n}
            </button>
          ))}
        </span>
      )}
    </section>
  );
}
