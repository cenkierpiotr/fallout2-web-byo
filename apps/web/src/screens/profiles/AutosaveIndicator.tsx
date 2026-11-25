import { t } from '../../i18n';
import { autosaveIndicator } from '../../state/autosave-indicator';

/** Maly wskaznik autozapisu (role=status, czytany przez czytniki ekranu). */
export function AutosaveIndicator() {
  const s = autosaveIndicator.value;
  return (
    <div
      class="autosave-indicator"
      role="status"
      aria-live="polite"
      data-testid="autosave-indicator"
    >
      {s ? t(`autosave.${s.state}`) : ''}
    </div>
  );
}
