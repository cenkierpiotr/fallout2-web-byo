import { t } from '../../i18n';
import type { ShownOption } from './dialog-model';

export interface OptionCardProps {
  option: ShownOption;
  current: boolean;
  /** Minimalna wysokosc celu dotyku w px (48 na touch, 32 na desktop). */
  minHeight: number;
  showSkillChecks: boolean;
  showReaction: boolean;
  onChoose(index: number): void;
}

export function OptionCard({
  option,
  current,
  minHeight,
  showSkillChecks,
  showReaction,
  onChoose,
}: OptionCardProps) {
  return (
    <li>
      <button
        type="button"
        class="option-card"
        data-testid={`dialog-option-${option.index}`}
        aria-current={current ? 'true' : undefined}
        data-reaction={showReaction ? option.reaction : undefined}
        style={{ minHeight: `${minHeight}px` }}
        onClick={() => onChoose(option.index)}
      >
        {option.key > 0 && <span class="option-key">{option.key}</span>}
        <span class="option-text">{option.text}</span>
        {showSkillChecks && option.iqRequired > 0 && (
          <span class="option-req">{t('dialog.requiresIq', { iq: option.iqRequired })}</span>
        )}
      </button>
    </li>
  );
}
