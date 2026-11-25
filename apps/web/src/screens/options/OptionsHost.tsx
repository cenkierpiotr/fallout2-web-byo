import { FIX_REGISTRY } from '@f2/rules';
import { OptionsScreen, type OptionsFixItem, type OptionsValues } from '@f2/ui';
import { detectInputProfile, readInputEnv } from '@f2/input';
import { locale, setLocale, t } from '../../i18n';
import { GraphicsSection } from './GraphicsSection';
import { UI_SCALE_PRESETS, settings, updateSettings, type Settings } from '../../settings';

const SCALE_KEYS = ['small', 'normal', 'large'] as const;

/** Skala UI w opcjach gry (te same presety co onboarding; da sie zmienic po jego pominieciu). */
export function UiScaleControl() {
  const cur = settings.value.uiScale;
  return (
    <div
      class="options-uiscale"
      role="group"
      data-testid="options-uiscale"
      aria-label={locale.value === 'pl' ? 'Skala interfejsu' : 'UI scale'}
    >
      <span>{locale.value === 'pl' ? 'Skala interfejsu' : 'UI scale'}</span>
      {UI_SCALE_PRESETS.map((v, i) => (
        <button
          type="button"
          key={v}
          data-testid={`options-scale-${SCALE_KEYS[i]}`}
          aria-pressed={cur === v}
          onClick={() => updateSettings({ uiScale: v })}
        >
          {t(`onboarding.scale.${SCALE_KEYS[i]}`)}
        </button>
      ))}
    </div>
  );
}

/** Widok ustawien jako wartosci ekranu opcji (czysta funkcja, testowalna). */
export function optionsValuesOf(s: Settings): OptionsValues {
  const pct = (v: number): number => Math.round(Math.max(0, Math.min(1, v)) * 100);
  return {
    masterVolume: pct(s.volume.master),
    musicVolume: pct(s.volume.music),
    sfxVolume: pct(s.volume.sfx),
    speechVolume: pct(s.volume.speech),
    language: locale.value,
    gameTextLanguage: s.gameTextLanguage,
    gameDifficulty: s.gameDifficulty,
    combatDifficulty: s.combatDifficulty,
    gameSpeed: s.gameSpeed,
    profile: s.inputProfile === 'auto' ? 'auto' : s.inputProfile,
    classicMode: s.classicMode,
  };
}

/** Rejestr poprawek jako lista dla ekranu opcji (tytul/opis w jezyku interfejsu). */
export function fixItemsOf(s: Settings, lang: 'pl' | 'en'): OptionsFixItem[] {
  return FIX_REGISTRY.map((f) => ({
    id: f.id,
    title: f.title[lang],
    desc: f.desc[lang],
    status: f.status,
    confidence: f.confidence,
    enabled: f.status === 'active' ? (s.fixes[f.id] ?? true) : f.status === 'external',
  }));
}

/** Zapis zmiany z ekranu opcji do ustawien (czysta logika, bez UI). */
export function applyOptionChange<K extends keyof OptionsValues>(
  key: K,
  value: OptionsValues[K],
): void {
  const s = settings.value;
  const v = value as never;
  switch (key) {
    case 'masterVolume':
    case 'musicVolume':
    case 'sfxVolume':
    case 'speechVolume': {
      const name = key.replace('Volume', '') as keyof Settings['volume'];
      updateSettings({ volume: { ...s.volume, [name]: (v as number) / 100 } });
      break;
    }
    case 'language':
      setLocale(v);
      break;
    case 'profile':
      updateSettings({ inputProfile: v });
      break;
    default:
      updateSettings({ [key]: v } as Partial<Settings>);
  }
}

export function applyFixChange(id: string, enabled: boolean): void {
  updateSettings({ fixes: { ...settings.value.fixes, [id]: enabled } });
}

export function OptionsHost() {
  const s = settings.value;
  const detected = detectInputProfile(readInputEnv(window));
  return (
    <div class="f2-options-host">
      <OptionsScreen
        values={optionsValuesOf(s)}
        fixes={fixItemsOf(s, locale.value)}
        detected={detected === 'touch' || detected === 'hybrid' ? detected : 'desktop'}
        onChange={applyOptionChange}
        onFixChange={applyFixChange}
      />
      <div class="f2-options-host__extras">
        <UiScaleControl />
        <GraphicsSection />
      </div>
    </div>
  );
}
