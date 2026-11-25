import { useState } from 'preact/hooks';
import { Button, Modal, Slider } from '../../components';
import { t } from '../../i18n';

export interface QuantitySheetProps {
  open: boolean;
  name: string;
  max: number;
  /** Czy przenosimy na stol (true) czy z powrotem do inwentarza. */
  toTable: boolean;
  /** Skorka FRM: okno w zielonym stylu LCD. */
  art?: boolean;
  onConfirm: (count: number) => void;
  onClose: () => void;
}

/** Wybor ilosci dla stosu: suwak + pole liczbowe + "wszystko". */
export function QuantitySheet({
  open,
  name,
  max,
  toTable,
  art = false,
  onConfirm,
  onClose,
}: QuantitySheetProps) {
  const [count, setCount] = useState(max);
  const clamp = (n: number) => Math.max(1, Math.min(max, Math.round(Number.isFinite(n) ? n : 1)));
  return (
    <Modal
      open={open}
      title={t(toTable ? 'barter.qty.titleOffer' : 'barter.qty.titleReturn', { name })}
      onClose={onClose}
    >
      <div class={`f2-barter-qty${art ? ' f2-barter-qty--art' : ''}`} data-testid="barter-qty">
        <Slider
          min={1}
          max={max}
          step={1}
          value={count}
          onChange={setCount}
          label={t('barter.qty.label')}
        />
        <label class="f2-barter-qty__field">
          <span>{t('barter.qty.label')}</span>
          <input
            type="number"
            min={1}
            max={max}
            value={count}
            data-testid="barter-qty-input"
            onInput={(e) => setCount(clamp(e.currentTarget.valueAsNumber))}
          />
        </label>
        <div class="f2-barter-qty__actions">
          <Button variant="secondary" onPress={() => setCount(max)}>
            {t('barter.qty.all')}
          </Button>
          <Button variant="primary" onPress={() => onConfirm(clamp(count))}>
            {t('barter.qty.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
