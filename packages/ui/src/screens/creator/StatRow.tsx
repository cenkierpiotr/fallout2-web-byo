import { Button } from '../../components';
import { t } from '../../i18n';
import type { StatItem } from './types';

export interface StatRowProps {
  stat: StatItem;
  pointsLeft: number;
  onAdjust: (id: number, delta: 1 | -1) => void;
  onSelect: (id: number) => void;
}

/** Wiersz atrybutu SPECIAL: nazwa, wartosc, przyciski - i +. */
export function StatRow({ stat, pointsLeft, onAdjust, onSelect }: StatRowProps) {
  return (
    <div
      class="f2-creator__stat"
      data-testid={`stat-${stat.id}`}
      onFocusCapture={() => onSelect(stat.id)}
      onMouseEnter={() => onSelect(stat.id)}
    >
      <span class="f2-creator__stat-name">{stat.name}</span>
      <Button
        variant="icon"
        aria-label={t('creator.stat.decrease', { name: stat.name })}
        disabled={stat.value <= stat.min}
        onPress={() => onAdjust(stat.id, -1)}
      >
        -
      </Button>
      <span class="f2-creator__stat-value" aria-live="polite">
        {stat.value}
      </span>
      <Button
        variant="icon"
        aria-label={t('creator.stat.increase', { name: stat.name })}
        disabled={stat.value >= stat.max || pointsLeft <= 0}
        onPress={() => onAdjust(stat.id, 1)}
      >
        +
      </Button>
    </div>
  );
}
