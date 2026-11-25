import { t } from '../i18n';
import { currentHint, dismissHint, skipTutorial } from '../state/tutorial-hints';

/** Pomijalna podpowiedz samouczka w grze (jedna naraz, kazda tylko raz). */
export function TutorialHint() {
  const h = currentHint.value;
  if (!h) return null;
  return (
    <aside class="tutorial-hint" data-testid="tutorial-hint" role="status">
      <p>{t(`tutorial.hint.${h}`)}</p>
      <button type="button" data-testid="tutorial-ok" onClick={dismissHint}>
        {t('tutorial.ok')}
      </button>
      <button type="button" data-testid="tutorial-skip" onClick={skipTutorial}>
        {t('tutorial.skip')}
      </button>
    </aside>
  );
}
