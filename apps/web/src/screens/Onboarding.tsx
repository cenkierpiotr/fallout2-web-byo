import { signal } from '@preact/signals';
import { t } from '../i18n';
import {
  STEPS,
  advance,
  loadState,
  saveState,
  skipAll,
  type OnboardingState,
} from '../state/onboarding';
import { UI_SCALE_PRESETS, settings, updateSettings } from '../settings';

const state = signal<OnboardingState>(loadState());
const set = (s: OnboardingState): void => {
  state.value = s;
  saveState(s);
};

const SCALE_KEYS = ['small', 'normal', 'large'] as const;

/** Krotki onboarding pierwszego startu (folder, wydanie, sterowanie, skala UI, samouczek); pomijalny, zapamietywany. */
export function Onboarding(props: { label?: string | undefined }) {
  const s = state.value;
  if (s.done) return null;
  const key = STEPS[s.step];
  return (
    <aside
      class="onboarding"
      data-testid="onboarding"
      role="dialog"
      aria-label={t('onboarding.title')}
    >
      <h2>{t('onboarding.title')}</h2>
      <p>{t(`onboarding.step.${key}`, { label: props.label ?? 'unknown' })}</p>
      {key === 'scale' && (
        <div class="onboarding__scales" role="group">
          {UI_SCALE_PRESETS.map((v, i) => (
            <button
              type="button"
              key={v}
              data-testid={`onboarding-scale-${SCALE_KEYS[i]}`}
              aria-pressed={settings.value.uiScale === v}
              onClick={() => updateSettings({ uiScale: v })}
            >
              {t(`onboarding.scale.${SCALE_KEYS[i]}`)}
            </button>
          ))}
        </div>
      )}
      <button type="button" data-testid="onboarding-next" onClick={() => set(advance(s))}>
        {t('onboarding.next')}
      </button>
      <button type="button" data-testid="onboarding-skip" onClick={() => set(skipAll())}>
        {t('onboarding.skip')}
      </button>
    </aside>
  );
}
