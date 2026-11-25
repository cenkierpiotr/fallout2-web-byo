import { useState } from 'preact/hooks';
import { Button } from '../../components';
import { t } from '../../i18n';
import type { PipboyClockView, PipboyCommands, PipboyView } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export interface AlarmTabProps {
  clock: PipboyClockView | undefined;
  blocked: PipboyView['restBlocked'];
  commands?: PipboyCommands | undefined;
}

/** Budzik: suwak godziny + odpoczynek 10/30 min i do wyleczenia; blokada z powodem. */
export function AlarmTab({ clock, blocked, commands }: AlarmTabProps) {
  const [hour, setHour] = useState(6);
  if (!clock) {
    return (
      <p class="f2-pipboy__placeholder" data-testid="pipboy-placeholder-clock">
        {t('pipboy.placeholder.clock')}
      </p>
    );
  }
  const can = !blocked && !!commands?.rest;
  return (
    <div class="f2-pipboy__alarm" data-testid="pipboy-clock">
      <p>{t('pipboy.clock.now', { day: clock.day, time: `${clock.hour}:${pad(clock.minute)}` })}</p>
      {blocked ? <p role="alert">{t(`pipboy.clock.blocked.${blocked}`)}</p> : null}
      <div class="f2-pipboy__row">
        <Button
          variant="secondary"
          disabled={!can}
          onPress={() => commands?.rest?.({ kind: 'minutes', n: 10 })}
        >
          {t('pipboy.clock.rest10')}
        </Button>
        <Button
          variant="secondary"
          disabled={!can}
          onPress={() => commands?.rest?.({ kind: 'minutes', n: 30 })}
        >
          {t('pipboy.clock.rest30')}
        </Button>
        <Button
          variant="secondary"
          disabled={!can}
          onPress={() => commands?.rest?.({ kind: 'healed' })}
        >
          {t('pipboy.clock.restHealed')}
        </Button>
      </div>
      <label class="f2-pipboy__row">
        <span>{t('pipboy.clock.hourLabel', { hour })}</span>
        <input
          type="range"
          min={0}
          max={23}
          step={1}
          value={hour}
          onInput={(e) => setHour(Number((e.currentTarget as HTMLInputElement).value))}
        />
      </label>
      <Button
        variant="primary"
        disabled={!can}
        onPress={() => commands?.rest?.({ kind: 'hour', h: hour })}
      >
        {t('pipboy.clock.restHour', { hour })}
      </Button>
    </div>
  );
}
