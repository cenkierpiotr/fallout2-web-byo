import type { ReadonlySignal } from '@preact/signals';
import { formatGameDate, t } from '../../i18n';
import type { ClockView } from './types';
import './rest.css';

export interface ClockProps {
  clock: ReadonlySignal<ClockView>;
}

/** Maly zegar/data gry do HUD (czyta sygnal, odswieza sie sam). */
export function Clock({ clock }: ClockProps) {
  const c = clock.value;
  const text = formatGameDate(c);
  const hh = String(c.hour).padStart(2, '0');
  const mm = String(c.minute).padStart(2, '0');
  return (
    <div class="f2-clock" role="timer" aria-label={t('hud.clock.label')} data-testid="hud-clock">
      <span class="f2-clock__time">
        {hh}:{mm}
      </span>
      <span class="f2-clock__date" title={text}>
        {formatGameDate({ year: c.year, month: c.month, day: c.day })}
      </span>
    </div>
  );
}
