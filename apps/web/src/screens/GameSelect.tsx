import { signal } from '@preact/signals';
import { t } from '../i18n';

/**
 * Ekran wyboru gry (Fallout 2 albo Fallout 1 Community Edition) w trybie Bring Your Own Game (BYO).
 * Wybor jest zapamietywany w localStorage; gry mozna tez przelaczac segmentowanym przyciskiem w topbarze.
 */

export type GameId = 'f2' | 'fo1';
const KEY = 'f2.game';
export const activeGame = signal<GameId>(loadGame());

function loadGame(): GameId {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'fo1') return 'fo1';
  } catch {
    /* ignoruj */
  }
  return 'f2';
}

export function setGame(g: GameId): void {
  activeGame.value = g;
  try {
    localStorage.setItem(KEY, g);
  } catch {
    /* ignoruj */
  }
}

const FEATURES = [
  {
    key: 'engine',
    titleKey: 'gameSelect.featEngineTitle',
    descKey: 'gameSelect.featEngineDesc',
  },
  {
    key: 'variants',
    titleKey: 'gameSelect.featVariantsTitle',
    descKey: 'gameSelect.featVariantsDesc',
  },
  {
    key: 'input',
    titleKey: 'gameSelect.featInputTitle',
    descKey: 'gameSelect.featInputDesc',
  },
  {
    key: 'privacy',
    titleKey: 'gameSelect.featPrivacyTitle',
    descKey: 'gameSelect.featPrivacyDesc',
  },
] as const;

export function GameSelect(props: { onChoose?: (g: GameId) => void }) {
  const choose = (g: GameId): void => {
    setGame(g);
    props.onChoose?.(g);
  };
  return (
    <div class="game-select" data-testid="game-select">
      <header class="game-select__header">
        <h2>{t('gameSelect.title')}</h2>
        <p class="game-select__subtitle">{t('gameSelect.subtitle')}</p>
      </header>
      <div class="game-select-cards">
        <button type="button" class="game-card" data-testid="choose-f2" onClick={() => choose('f2')}>
          <span class="game-card__badge">{t('gameSelect.f2Badge')}</span>
          <h3>Fallout 2</h3>
          <p class="muted">{t('gameSelect.f2')}</p>
          <span class="game-card__play">{t('gameSelect.playNow')}</span>
        </button>
        <button
          type="button"
          class="game-card"
          data-testid="choose-fo1"
          onClick={() => choose('fo1')}
        >
          <span class="game-card__badge">{t('gameSelect.fo1Badge')}</span>
          <h3>Fallout 1</h3>
          <p class="muted">{t('gameSelect.fo1')}</p>
          <span class="game-card__play">{t('gameSelect.playNow')}</span>
        </button>
      </div>
      <section class="game-select-details" aria-label={t('gameSelect.featuresLabel')}>
        <div class="game-select-features">
          {FEATURES.map((f) => (
            <article class="game-feature" key={f.key}>
              <h4>{t(f.titleKey)}</h4>
              <p>{t(f.descKey)}</p>
            </article>
          ))}
        </div>
      </section>
      <footer class="game-select-footer">
        <p>{t('gameSelect.footer', { version: 'v1.1.0' })}</p>
      </footer>
    </div>
  );
}
