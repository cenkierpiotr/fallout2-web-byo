import type { ShownOption } from './model';

export interface OptionCardProps {
  option: ShownOption;
  showReaction: boolean;
  onChoose(index: number): void;
}

/** Karta opcji: przycisk >= 48 px (cel dotyku z --dialog-target), numer klawisza i oznaczenie wymagania. */
export function OptionCard({ option, showReaction, onChoose }: OptionCardProps) {
  return (
    <li>
      <button
        type="button"
        class="f2-option-card"
        data-testid="dialog-option"
        data-option-index={option.index}
        data-reaction={showReaction ? option.reaction : undefined}
        aria-keyshortcuts={option.key > 0 ? String(option.key) : undefined}
        onClick={() => onChoose(option.index)}
      >
        {option.key > 0 && (
          <span class="f2-option-card__key" aria-hidden="true">
            {option.key}
          </span>
        )}
        <span class="f2-option-card__text">{option.text}</span>
        {option.requirement !== '' && (
          <span class="f2-option-card__req" data-testid="dialog-option-req">
            {option.requirement}
          </span>
        )}
      </button>
    </li>
  );
}
