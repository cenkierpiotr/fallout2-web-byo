import { useEffect, useRef } from 'preact/hooks';
import { t } from '../../i18n';

export interface DialogHistoryProps {
  entries: { who: 'npc' | 'player'; text: string }[];
}

export function DialogHistory({ entries }: DialogHistoryProps) {
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);
  if (entries.length === 0) return null;
  return (
    <ul
      class="dialog-history"
      ref={ref}
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
