import { Select } from '../../components/Select';
import { isLocale, locale, setLocale, t, type Locale } from '../../i18n';

export type GameTextLanguage = 'auto' | 'english' | 'polish';

export interface LanguageTabProps {
  gameTextLanguage: GameTextLanguage;
  onGameTextLanguageChange: (value: GameTextLanguage) => void;
  /** Wywolywane po zmianie jezyka interfejsu (np. zapis do SettingsStore.language). */
  onLocaleChange?: (value: Locale) => void;
}

const isGameText = (v: string): v is GameTextLanguage =>
  v === 'auto' || v === 'english' || v === 'polish';

export const LanguageTab = ({
  gameTextLanguage,
  onGameTextLanguageChange,
  onLocaleChange,
}: LanguageTabProps) => (
  <div class="f2-settings-language">
    <Select
      label={t('settings.language.interface')}
      value={locale.value}
      onChange={(v) => {
        if (!isLocale(v)) return;
        setLocale(v);
        onLocaleChange?.(v);
      }}
      options={[
        { value: 'pl', label: t('settings.language.interface.pl') },
        { value: 'en', label: t('settings.language.interface.en') },
      ]}
    />
    <Select
      label={t('settings.language.gameText')}
      value={gameTextLanguage}
      onChange={(v) => {
        if (isGameText(v)) onGameTextLanguageChange(v);
      }}
      options={[
        { value: 'auto', label: t('settings.language.gameText.auto') },
        { value: 'english', label: t('settings.language.gameText.english') },
        { value: 'polish', label: t('settings.language.gameText.polish') },
      ]}
    />
    <p class="f2-settings-language__hint">{t('settings.language.gameText.hint')}</p>
  </div>
);
