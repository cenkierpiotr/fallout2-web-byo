import type { ReadonlySignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { t } from '../../i18n';
import type { ArtUrl, EndgameCommands, EndgameView } from './types';
import './endgame.css';

export interface EndgameScreenProps {
  view: ReadonlySignal<EndgameView>;
  commands: Pick<EndgameCommands, 'advance'>;
  artUrl?: ArtUrl;
  /** Czas panoramy (czas narracji), s; domyslnie 20. */
  panSeconds?: number;
}

/** Klawisze przechodzace do kolejnego slajdu. */
export const ADVANCE_KEYS = new Set([' ', 'Enter', 'ArrowRight', 'Escape']);

/** Slajd zakonczenia: obraz, napisy narratora (aria-live), panorama art 327, klawisz/tap = dalej. */
export function EndgameScreen({ view, commands, artUrl, panSeconds = 20 }: EndgameScreenProps) {
  const slide = view.value.slide;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!ADVANCE_KEYS.has(e.key)) return;
      e.preventDefault();
      commands.advance();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commands]);

  const url = slide ? artUrl?.(slide.art) : undefined;
  return (
    <section
      class="f2-endgame"
      role="region"
      aria-label={t('endgame.title')}
      data-testid="endgame-screen"
      data-art={slide?.art ?? ''}
      data-pan={slide?.pan ?? 0}
      onClick={() => commands.advance()}
    >
      <div class="f2-endgame__frame">
        {slide &&
          (url ? (
            <img
              class="f2-endgame__art"
              src={url}
              alt=""
              data-testid="endgame-art"
              style={{ '--f2-pan-seconds': `${panSeconds}s` }}
            />
          ) : (
            <div
              class="f2-endgame__art f2-endgame__art--placeholder"
              data-testid="endgame-art"
              style={{ '--f2-pan-seconds': `${panSeconds}s` }}
            >
              {t('endgame.art', { art: slide.art })}
            </div>
          ))}
      </div>
      <p class="f2-endgame__caption" aria-live="polite" data-testid="endgame-caption">
        {slide?.text ?? ''}
      </p>
      <button
        type="button"
        class="f2-button f2-button--secondary f2-button--md f2-endgame__next"
        data-testid="endgame-next"
        onClick={(e) => {
          e.stopPropagation();
          commands.advance();
        }}
      >
        {t('endgame.next')}
      </button>
    </section>
  );
}
