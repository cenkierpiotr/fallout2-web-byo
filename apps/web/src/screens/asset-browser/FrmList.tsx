import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../i18n';

export interface FrmItem {
  label: string;
  path: string;
}

const ROW = 32;

/** Lista z prostym okienkowaniem (rendering tylko widocznych wierszy). */
export function FrmList({
  items,
  selected,
  onSelect,
}: {
  items: FrmItem[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(400);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // przewin do zaznaczonego (np. po ArrowUp/Down)
  useEffect(() => {
    const el = ref.current;
    if (!el || !selected) return;
    const i = items.findIndex((x) => x.path === selected);
    if (i < 0) return;
    const top = i * ROW;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW - el.clientHeight;
  }, [selected, items]);

  if (items.length === 0) return <p class="muted">{t('browser.empty')}</p>;

  const first = Math.max(0, Math.floor(scrollTop / ROW) - 5);
  const last = Math.min(items.length, Math.ceil((scrollTop + height) / ROW) + 5);
  return (
    <div
      class="list-scroll"
      data-testid="frm-list"
      data-count={items.length}
      ref={ref}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      style={{ '--row-h': `${ROW}px` }}
    >
      <div style={{ height: `${items.length * ROW}px`, position: 'relative' }}>
        {items.slice(first, last).map((it, k) => (
          <button
            type="button"
            class="list-row"
            data-testid={`frm-item-${it.label}`}
            key={it.path}
            style={{ position: 'absolute', top: `${(first + k) * ROW}px`, left: 0, right: 0 }}
            aria-current={it.path === selected}
            onClick={() => onSelect(it.path)}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}
