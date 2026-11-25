import { t } from '../../i18n';
import { TRAITS_MAX, type TraitItem } from './types';

export interface TraitPickerProps {
  traits: TraitItem[];
  traitsUsed: number;
  onToggle: (id: number) => void;
}

/** Wybor cech (do 2): karty z opisem. */
export function TraitPicker({ traits, traitsUsed, onToggle }: TraitPickerProps) {
  return (
    <div class="f2-creator__traits" data-testid="trait-picker">
      <p class="f2-creator__counter" data-testid="traits-counter">
        {t('creator.traits.count', { used: traitsUsed, max: TRAITS_MAX })}
      </p>
      <ul class="f2-creator__list">
        {traits.map((tr) => {
          const blocked = !tr.selected && traitsUsed >= TRAITS_MAX;
          return (
            <li key={tr.id} class="f2-creator__trait" data-selected={String(tr.selected)}>
              <button
                type="button"
                class={`f2-button f2-button--${tr.selected ? 'primary' : 'secondary'} f2-button--md f2-creator__trait-btn`}
                aria-pressed={tr.selected}
                disabled={blocked}
                onClick={() => onToggle(tr.id)}
              >
                {tr.name}
              </button>
              <p class="f2-creator__trait-desc">{tr.description}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
