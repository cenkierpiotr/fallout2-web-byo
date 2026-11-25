import { useEffect, useRef } from 'preact/hooks';
import { t } from '../../i18n';
import type { DialogHistoryEntry } from './types';

export function DialogHistory({
  entries,
  expanded,
}: {
  entries: DialogHistoryEntry[];
  expanded: boolean;
}) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length, expanded]);
  if (entries.length === 0) return null;
  return (
    <ul
      class="f2-dialog__history"
      data-expanded={expanded ? 'true' : 'false'}
      ref={ref}
      tabIndex={0}
      role="log"
      aria-label={t('dialog.history')}
      data-testid="dialog-history"
    >
      {entries.map((e, i) => (
        <li key={i} data-who={e.who}>
          {e.text}
        </li>
      ))}
    </ul>
  );
}
