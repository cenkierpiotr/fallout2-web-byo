import { Button } from '../../components';
import { t } from '../../i18n';
import type { CreatorReason, CreatorView } from './types';

export interface SummaryProps {
  view: CreatorView;
  onFinish: () => void;
}

const reasonText = (r: CreatorReason, view: CreatorView): string => {
  switch (r) {
    case 'statPoints':
      return t('creator.reason.statPoints', { count: view.pointsLeft });
    case 'tags':
      return t('creator.reason.tags', { count: 3 - view.tagsUsed });
    case 'name':
      return t('creator.reason.name');
  }
};

/** Podsumowanie postaci, walidacja na zywo i przycisk zakonczenia. */
export function Summary({ view, onFinish }: SummaryProps) {
  return (
    <div class="f2-creator__summary" data-testid="creator-summary">
      <dl class="f2-creator__derived">
        {view.derived.map((d) => (
          <div key={d.id} class="f2-creator__derived-row">
            <dt>{t(`creator.derived.${d.id}`)}</dt>
            <dd>{d.value}</dd>
          </div>
        ))}
      </dl>
      <p class="f2-creator__points" data-testid="points-left">
        {t('creator.points.left', { count: view.pointsLeft })}
      </p>
      {view.reasons.length > 0 && (
        <div role="status">
          <ul class="f2-creator__reasons" data-testid="finish-reasons">
            {view.reasons.map((r) => (
              <li key={r}>{reasonText(r, view)}</li>
            ))}
          </ul>
        </div>
      )}
      <Button variant="primary" size="lg" disabled={!view.canFinish} onPress={onFinish}>
        {t('creator.finish')}
      </Button>
    </div>
  );
}
