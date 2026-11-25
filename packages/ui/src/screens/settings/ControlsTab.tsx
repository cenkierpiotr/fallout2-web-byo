import { Panel, Select, Slider, Toggle } from '../../components';
import { t } from '../../i18n';
import { FONT_SCALE_MAX, FONT_SCALE_MIN } from '../../theme/ThemeProvider';

export type ProfileSetting = 'auto' | 'desktop' | 'touch' | 'hybrid';
export type ColorBlindSetting = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
export type ThemeSetting = 'modern' | 'retro' | 'high-contrast';

export interface ControlsValues {
  profile: ProfileSetting;
  theme: ThemeSetting;
  fontScale: number;
  language: string;
  gameTextLanguage: string;
  autosave: boolean;
  showSkillCheckPercent: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
  colorBlindMode: ColorBlindSetting;
}

export interface ControlsTabProps {
  values: ControlsValues;
  /** Profil wykryty automatycznie (pokazywany przy opcji "auto"). */
  detected: 'desktop' | 'touch' | 'hybrid';
  onChange: <K extends keyof ControlsValues>(key: K, value: ControlsValues[K]) => void;
}

const profileLabel = (p: 'desktop' | 'touch' | 'hybrid'): string =>
  t(`settings.controls.profile.${p}`);

/** Zakladka ustawien: sterowanie, wyglad i dostepnosc. Komponent bezstanowy. */
export function ControlsTab({ values, detected, onChange }: ControlsTabProps) {
  return (
    <div class="f2-controls-tab" data-testid="controls-tab">
      <Panel title={t('settings.controls.title')}>
        <Select
          label={t('settings.controls.profile')}
          value={values.profile}
          onChange={(v) => onChange('profile', v as ProfileSetting)}
          options={[
            {
              value: 'auto',
              label: t('settings.controls.profile.auto', { detected: profileLabel(detected) }),
            },
            { value: 'desktop', label: profileLabel('desktop') },
            { value: 'touch', label: profileLabel('touch') },
            { value: 'hybrid', label: profileLabel('hybrid') },
          ]}
        />
        <Toggle
          label={t('settings.controls.showSkillCheckPercent')}
          checked={values.showSkillCheckPercent}
          onChange={(c) => onChange('showSkillCheckPercent', c)}
        />
        <Toggle
          label={t('settings.controls.autosave')}
          checked={values.autosave}
          onChange={(c) => onChange('autosave', c)}
        />
      </Panel>
      <Panel title={t('settings.appearance.title')}>
        <Select
          label={t('settings.appearance.theme')}
          value={values.theme}
          onChange={(v) => onChange('theme', v as ThemeSetting)}
          options={[
            { value: 'modern', label: t('settings.appearance.theme.modern') },
            { value: 'retro', label: t('settings.appearance.theme.retro') },
            { value: 'high-contrast', label: t('settings.appearance.theme.highContrast') },
          ]}
        />
        <Slider
          label={t('settings.appearance.fontScale')}
          min={FONT_SCALE_MIN}
          max={FONT_SCALE_MAX}
          step={0.05}
          value={values.fontScale}
          onChange={(n) => onChange('fontScale', n)}
        />
        <Select
          label={t('settings.appearance.colorBlind')}
          value={values.colorBlindMode}
          onChange={(v) => onChange('colorBlindMode', v as ColorBlindSetting)}
          options={[
            { value: 'none', label: t('settings.appearance.colorBlind.none') },
            { value: 'protanopia', label: t('settings.appearance.colorBlind.protanopia') },
            { value: 'deuteranopia', label: t('settings.appearance.colorBlind.deuteranopia') },
            { value: 'tritanopia', label: t('settings.appearance.colorBlind.tritanopia') },
          ]}
        />
        <Toggle
          label={t('settings.appearance.reduceMotion')}
          checked={values.reduceMotion}
          onChange={(c) => onChange('reduceMotion', c)}
        />
        <Toggle
          label={t('settings.appearance.highContrast')}
          checked={values.highContrast}
          onChange={(c) => onChange('highContrast', c)}
        />
      </Panel>
    </div>
  );
}
