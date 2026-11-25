import { useEffect, useRef } from 'preact/hooks';
import { t } from '../../i18n';
import { attachDrag } from '../inventory/DragDrop';
import { ItemIcon } from '../inventory/ItemCard';
import type { SpriteUrl } from '../inventory/types';
import type { BarterItem, BarterSide } from './types';

export type ColumnKind = 'inv' | 'table';

export interface RowDrag {
  onDrop: (target: string | null, item: BarterItem, side: BarterSide, kind: ColumnKind) => void;
  onHover: (target: string | null) => void;
}

interface RowProps {
  item: BarterItem;
  side: BarterSide;
  kind: ColumnKind;
  sprite: SpriteUrl;
  drag: RowDrag;
  onActivate: (item: BarterItem) => void;
}

function ItemRow({ item, side, kind, sprite, drag, onActivate }: RowProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const latest = useRef({ item, side, kind, sprite, drag });
  latest.current = { item, side, kind, sprite, drag };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return attachDrag<BarterItem>(el, {
      payload: () => latest.current.item,
      createGhost: () => {
        const ghost = document.createElement('div');
        ghost.className = 'f2-inv-ghost';
        ghost.setAttribute('data-testid', 'drag-ghost');
        ghost.textContent = latest.current.item.name;
        return ghost;
      },
      onHover: (target) => latest.current.drag.onHover(target),
      onDrop: (target, payload) =>
        latest.current.drag.onDrop(target, payload, latest.current.side, latest.current.kind),
      onCancel: () => latest.current.drag.onHover(null),
      onEnd: () => latest.current.drag.onHover(null),
    });
  }, []);

  const unit = item.value;
  return (
    <button
      type="button"
      ref={ref}
      class={`f2-barter-row${item.tradeable ? '' : ' f2-barter-row--locked'}`}
      data-testid="barter-item"
      data-item-id={item.id}
      aria-label={
        item.count > 1
          ? t('barter.item.aria.many', { name: item.name, count: item.count, value: unit })
          : t('barter.item.aria.one', { name: item.name, value: unit })
      }
      onClick={() => onActivate(item)}
    >
      <ItemIcon fid={item.fid} sprite={sprite} />
      <span class="f2-barter-row__name">{item.name}</span>
      {item.count > 1 && <span class="f2-barter-row__count">{`x${item.count}`}</span>}
      <span class="f2-barter-row__value">{t('barter.value.short', { value: unit })}</span>
      {!item.tradeable && <span class="f2-barter-row__lock">{t('barter.item.locked')}</span>}
    </button>
  );
}

export interface OfferColumnProps {
  title: string;
  side: BarterSide;
  kind: ColumnKind;
  items: readonly BarterItem[];
  sprite: SpriteUrl;
  drag: RowDrag;
  highlighted: boolean;
  onActivate: (item: BarterItem) => void;
}

/** Kolumna przedmiotow: inwentarz strony albo jej stol ofert; cala kolumna jest celem upuszczenia. */
export function OfferColumn({
  title,
  side,
  kind,
  items,
  sprite,
  drag,
  highlighted,
  onActivate,
}: OfferColumnProps) {
  const dropId = `${side}:${kind}`;
  return (
    <section
      class={`f2-barter-col f2-barter-col--${kind}${highlighted ? ' f2-inv-drop--hover' : ''}`}
      data-drop={dropId}
      data-testid={`barter-${side}-${kind}`}
      aria-label={title}
    >
      <h3 class="f2-barter-col__title">{title}</h3>
      {items.length === 0 ? (
        <p class="f2-barter-col__empty">
          {kind === 'table' ? t('barter.table.empty') : t('barter.inventory.empty')}
        </p>
      ) : (
        <ul class="f2-barter-list">
          {items.map((it) => (
            <li key={it.id}>
              <ItemRow
                item={it}
                side={side}
                kind={kind}
                sprite={sprite}
                drag={drag}
                onActivate={onActivate}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
