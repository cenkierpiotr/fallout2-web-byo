import { useState } from 'preact/hooks';
import { Button } from '../../components/Button';
import { Toggle } from '../../components/Toggle';
import { Tooltip } from '../../components/Tooltip';
import { t } from '../../i18n';
import { ResponsiveDialog } from './ResponsiveDialog';
import type { PerkOptionView } from './types';
import { formatUnmet } from './unmet';

export interface PerkPickerProps {
  open: boolean;
  options: PerkOptionView[];
  onPick: (perk: number) => void;
  onClose: () => void;
  /** Skorka FRM: zielona ramka i cele min 44px. */
  art?: boolean;
}

export const PerkPicker = ({ open, options, onPick, onClose, art = false }: PerkPickerProps) => {
  const [selected, setSelected] = useState<number | null>(null);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const visible = showUnavailable ? options : options.filter((o) => o.available);

  return (
    <ResponsiveDialog open={open} title={t('character.perk.pickerTitle')} onClose={onClose}>
      <div class={`f2-char__picker${art ? ' f2-char__dialog--art' : ''}`} data-testid="perk-picker">
        <Toggle
          label={t('character.perk.showUnavailable')}
          checked={showUnavailable}
          onChange={setShowUnavailable}
        />
        {visible.length === 0 && <p>{t('character.perk.none')}</p>}
        <ul class="f2-char__perk-list" role="listbox" aria-label={t('character.perk.pickerTitle')}>
          {visible.map((o) => {
            const row = (
              <button
                type="button"
                role="option"
                aria-selected={selected === o.id}
                aria-disabled={!o.available}
                data-testid={`perk-option-${o.id}`}
                class={`f2-char__perk${selected === o.id ? ' is-selected' : ''}${o.available ? '' : ' is-unavailable'}`}
                onClick={() => {
                  if (o.available) setSelected(o.id);
                }}
              >
                <strong>{o.name}</strong>
                <span class="f2-char__perk-rank">
                  {t('character.perk.rank', { rank: o.rank + 1, max: o.maxRank })}
                </span>
                <span class="f2-char__perk-desc">{o.description}</span>
              </button>
            );
            return (
              <li key={o.id}>
                {o.available || o.unmet.length === 0 ? (
                  row
                ) : (
                  <Tooltip
                    content={
                      <div data-testid="perk-unmet">
                        <div>{t('character.perk.unmetTitle')}</div>
                        <ul>
                          {o.unmet.map((u) => (
                            <li key={u}>{formatUnmet(u)}</li>
                          ))}
                        </ul>
                      </div>
                    }
                  >
                    {row}
                  </Tooltip>
                )}
              </li>
            );
          })}
        </ul>
        <div class="f2-char__actions">
          <Button variant="secondary" onPress={onClose}>
            {t('character.dialog.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={selected === null}
            onPress={() => {
              if (selected !== null) onPick(selected);
            }}
          >
            {t('character.perk.choose')}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
};
