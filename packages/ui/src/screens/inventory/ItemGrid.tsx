import { useEffect, useRef, useState } from 'preact/hooks';
import { VirtualList } from '../../components';
import { t } from '../../i18n';
import { ItemCard, type ItemDragHandlers, type ItemSource } from './ItemCard';
import type { ItemView, SpriteUrl } from './types';

export interface ItemGridProps {
  items: ItemView[];
  label: string;
  source: ItemSource;
  /** Wartosc `data-drop` calej siatki (cel upuszczenia). */
  dropId: string;
  sprite: SpriteUrl;
  drag: ItemDragHandlers;
  selectedIds: ReadonlySet<number>;
  multi: boolean;
  onActivate: (item: ItemView, ev: { x: number; y: number }) => void;
  highlighted?: boolean;
  height?: number;
  /** Wysokosc = wszystkie wiersze (bez wlasnego przewijania; przewija rodzic). */
  autoHeight?: boolean;
  minCell?: number;
  rowHeight?: number;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  const n = Math.max(1, size);
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n));
  return rows;
}

/** Siatka przedmiotow na VirtualList: wiersze po `columns` kart, kolumny liczone z szerokosci. */
export function ItemGrid({
  items,
  label,
  source,
  dropId,
  sprite,
  drag,
  selectedIds,
  multi,
  onActivate,
  highlighted,
  height = 360,
  autoHeight = false,
  minCell = 132,
  rowHeight = 76,
}: ItemGridProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(4);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setColumns(Math.max(1, Math.floor(w / minCell)));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [minCell]);

  const rows = chunk(items, columns);

  return (
    <div
      ref={wrapRef}
      class={`f2-inv-grid${highlighted ? ' f2-inv-drop--hover' : ''}`}
      data-drop={dropId}
      data-testid={`grid-${source}`}
    >
      {items.length === 0 ? (
        <p class="f2-inv-empty">{t('inventory.empty')}</p>
      ) : (
        <VirtualList
          items={rows}
          rowHeight={rowHeight}
          height={autoHeight ? Math.max(1, rows.length) * rowHeight : height}
          overscan={2}
          label={label}
          render={(row) => (
            <div class="f2-inv-row" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
              {row.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  source={source}
                  sprite={sprite}
                  selected={selectedIds.has(item.id)}
                  multi={multi}
                  drag={drag}
                  onActivate={onActivate}
                />
              ))}
            </div>
          )}
        />
      )}
    </div>
  );
}
