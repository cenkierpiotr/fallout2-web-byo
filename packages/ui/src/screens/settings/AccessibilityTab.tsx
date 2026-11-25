import './accessibility.css';
import { Panel, Select, Slider, Toggle } from '../../components';
import type { A11yValues, ColorBlindMode } from '../../a11y/apply';
import { t } from '../../i18n';
import { FONT_SCALE_MAX, FONT_SCALE_MIN } from '../../theme/ThemeProvider';

export interface AccessibilityTabProps {
  values: A11yValues;
  onChange: <K extends keyof A11yValues>(key: K, value: A11yValues[K]) => void;
}

/** Zakladka Dostepnosc: skala czcionki z podgladem, kontrast, daltonizm, ruch, napisy mowy. Bezstanowa. */
export function AccessibilityTab({ values, onChange }: AccessibilityTabProps) {
  return (
    <div class="f2-a11y-tab" data-testid="a11y-tab">
      <Panel title={t('settings.a11y.title')}>
        <Slider
          label={t('settings.a11y.fontScale')}
          min={FONT_SCALE_MIN}
          max={FONT_SCALE_MAX}
          step={0.05}
          value={values.fontScale}
          onChange={(n) => onChange('fontScale', n)}
        />
        <p class="f2-a11y-tab__preview" data-testid="a11y-preview" aria-live="off">
          {t('settings.a11y.preview', { scale: Math.round(values.fontScale * 100) })}
        </p>
        <Toggle
          label={t('settings.a11y.highContrast')}
          checked={values.highContrast}
          onChange={(c) => onChange('highContrast', c)}
        />
        <Select
          label={t('settings.a11y.colorBlind')}
          value={values.colorBlind}
          onChange={(v) => onChange('colorBlind', v as ColorBlindMode)}
          options={[
            { value: 'none', label: t('settings.a11y.colorBlind.none') },
            { value: 'protan', label: t('settings.a11y.colorBlind.protan') },
            { value: 'deutan', label: t('settings.a11y.colorBlind.deutan') },
            { value: 'tritan', label: t('settings.a11y.colorBlind.tritan') },
          ]}
        />
        <Toggle
          label={t('settings.a11y.reduceMotion')}
          checked={values.reduceMotion}
          onChange={(c) => onChange('reduceMotion', c)}
        />
        <Toggle
          label={t('settings.a11y.speechCaptions')}
          checked={values.speechCaptions}
          onChange={(c) => onChange('speechCaptions', c)}
        />
      </Panel>
    </div>
  );
}
