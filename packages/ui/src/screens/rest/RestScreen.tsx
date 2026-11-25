import type { ReadonlySignal } from '@preact/signals';
import { useState } from 'preact/hooks';
import { Button, Panel } from '../../components';
import { ArtAt, ArtStage, useLayoutMode, useUiArt } from '../../art';
import { formatGameDate, formatNumber, t } from '../../i18n';
import { useTheme } from '../../theme/ThemeProvider';
import {
  REST_CUSTOM_MAX,
  REST_CUSTOM_MIN,
  REST_PRESETS,
  type RestCommands,
  type RestResultView,
  type RestView,
} from './types';
import './rest.css';

export interface RestScreenProps {
  view: ReadonlySignal<RestView>;
  commands: RestCommands;
}

function resultText(r: RestResultView): string {
  const hours = formatNumber(r.hoursRested, { maximumFractionDigits: 1 });
  const hp = formatNumber(r.hpHealed);
  if (r.reason === 'enemies-nearby') return t('rest.result.enemies');
  if (r.reason === 'interrupted') return t('rest.result.interrupted', { hours, hp });
  return t('rest.result.ok', { hours, hp });
}

/** Okno odpoczynku: gotowe tryby, wlasna liczba godzin, komunikaty o wrogach i przerwaniu. */
export function RestScreen({ view, commands }: RestScreenProps) {
  const { profile } = useTheme();
  // Skorka FRM: odpoczynek w oryginale dzieje sie w oknie Pip-Boya (pip.frm), wiec uzywa jego tla.
  // Hooki zawsze bezwarunkowo; brak tla => fallback 1:1.
  const bg = useUiArt('rest.bg');
  const mode = useLayoutMode();
  const v = view.value;
  const [hoursText, setHoursText] = useState('8');
  const hours = Number(hoursText);
  const hoursValid =
    hoursText.trim() !== '' &&
    Number.isInteger(hours) &&
    hours >= REST_CUSTOM_MIN &&
    hours <= REST_CUSTOM_MAX;
  const blocked = v.enemiesNearby;
  const healed = v.hp >= v.hpMax;

  const body = (
    <div class="f2-rest__root" data-testid="rest-screen" data-profile={profile}>
      <p class="f2-rest__now" data-testid="rest-now">
        {t('rest.now', { date: formatGameDate(v.clock) })}
      </p>
      <p class="f2-rest__hp" data-testid="rest-hp">
        {t('rest.hp', { hp: v.hp, max: v.hpMax })}
      </p>
      {blocked && (
        <p class="f2-rest__warning" role="alert" data-testid="rest-enemies">
          {t('rest.enemies')}
        </p>
      )}
      <div role="group" aria-label={t('rest.modes')} class="f2-rest__modes">
        {REST_PRESETS.map((id) => (
          <Button
            key={id}
            variant="secondary"
            disabled={blocked || (id === 'until-healed' && healed)}
            onPress={() => commands.rest(id)}
          >
            <span data-testid={`rest-mode-${id}`}>{t(`rest.mode.${id}`)}</span>
          </Button>
        ))}
      </div>
      <form
        class="f2-rest__custom"
        onSubmit={(e) => {
          e.preventDefault();
          if (!blocked && hoursValid) commands.rest({ hours });
        }}
      >
        <label class="f2-rest__label">
          <span>{t('rest.custom.label')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={REST_CUSTOM_MIN}
            max={REST_CUSTOM_MAX}
            step={1}
            value={hoursText}
            aria-invalid={!hoursValid}
            aria-describedby="f2-rest-custom-hint"
            data-testid="rest-hours"
            onInput={(e) => setHoursText((e.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <button
          type="submit"
          class="f2-button f2-button--primary f2-button--md"
          disabled={blocked || !hoursValid}
          data-testid="rest-custom-go"
        >
          {t('rest.custom.go')}
        </button>
        <span
          id="f2-rest-custom-hint"
          class={hoursValid ? 'f2-rest__hint' : 'f2-rest__hint f2-rest__hint--error'}
        >
          {t('rest.custom.hint', { min: REST_CUSTOM_MIN, max: REST_CUSTOM_MAX })}
        </span>
      </form>
      <div role="status" aria-live="polite" class="f2-rest__result" data-testid="rest-result">
        {v.lastResult && (
          <span data-reason={v.lastResult.reason ?? 'ok'}>{resultText(v.lastResult)}</span>
        )}
      </div>
      <div class="f2-rest__footer">
        <Button variant="secondary" onPress={() => commands.close()}>
          {t('rest.close')}
        </Button>
      </div>
    </div>
  );

  if (!bg) return <Panel class="f2-rest">{body}</Panel>;

  // TODO verify: obszar LCD pip.frm (254,46 374x410) wg fallout1-ce pipboy.cc.
  const touch = mode === 'touch';
  return (
    <div class="f2-rest f2-rest--art">
      <div class="f2-rest__scene">
        <ArtStage background="rest.bg" minTouch={touch}>
          {touch ? (
            <div class="f2-rest__touch">{body}</div>
          ) : (
            <ArtAt x={254} y={46} w={374} h={410}>
              <div class="f2-rest__lcd">{body}</div>
            </ArtAt>
          )}
        </ArtStage>
      </div>
    </div>
  );
}
