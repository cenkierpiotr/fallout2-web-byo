import type { ReadonlySignal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { t } from '../../i18n';
import {
  CREDITS_LINE_PX,
  CREDITS_SPEED_PX_PER_S,
  type EndgameCommands,
  type EndgameView,
} from './types';
import './endgame.css';

export interface CreditsScreenProps {
  view: ReadonlySignal<EndgameView>;
  commands: Pick<EndgameCommands, 'finishCredits'>;
  /** Predkosc przewijania, px/s (domyslnie z oryginalu: 26). */
  speed?: number;
  /** Wysokosc obszaru przewijania w px, do wyliczenia czasu (domyslnie 480 jak w oryginale). */
  viewportPx?: number;
}

/** Czas przewijania w sekundach: wszystkie wiersze plus pusty ekran (480 klatek w oryginale). */
export function creditsDurationSeconds(lines: number, speed: number, viewportPx: number): number {
  return (lines * CREDITS_LINE_PX + viewportPx) / speed;
}

/** Napisy koncowe: przewijanie CSS (zatrzymane przy prefers-reduced-motion), ESC lub tap pomija. */
export function CreditsScreen({
  view,
  commands,
  speed = CREDITS_SPEED_PX_PER_S,
  viewportPx = 480,
}: CreditsScreenProps) {
  const lines = view.value.credits;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      commands.finishCredits();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [commands]);

  const seconds = creditsDurationSeconds(lines.length, speed, viewportPx);
  return (
    <section
      class="f2-credits"
      role="region"
      aria-label={t('credits.title')}
      data-testid="credits-screen"
      onClick={() => commands.finishCredits()}
    >
      <div
        class="f2-credits__roll"
        data-testid="credits-roll"
        style={{
          '--f2-credits-seconds': `${seconds}s`,
          '--f2-credits-line': `${CREDITS_LINE_PX}px`,
        }}
        onAnimationEnd={() => commands.finishCredits()}
      >
        {lines.map((l, i) =>
          l.kind === 'blank' ? (
            <div key={i} class="f2-credits__line f2-credits__line--blank" aria-hidden="true" />
          ) : (
            <p key={i} class={`f2-credits__line f2-credits__line--${l.kind}`} data-kind={l.kind}>
              {l.text}
            </p>
          ),
        )}
      </div>
      <button
        type="button"
        class="f2-button f2-button--secondary f2-button--md f2-credits__skip"
        data-testid="credits-skip"
        onClick={(e) => {
          e.stopPropagation();
          commands.finishCredits();
        }}
      >
        {t('credits.skip')}
      </button>
    </section>
  );
}
