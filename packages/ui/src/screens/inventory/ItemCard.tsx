import { useEffect, useRef } from 'preact/hooks';
import { t } from '../../i18n';
import { attachDrag } from './DragDrop';
import { stackWeight } from './model';
import type { ItemView, SpriteUrl } from './types';

export type ItemSource = 'player' | 'container' | 'slot:left' | 'slot:right' | 'slot:armor';

/** Wspolna obsluga przeciagania przekazywana z ekranu do kart. */
export interface ItemDragHandlers {
  onDrop: (target: string | null, item: ItemView, source: ItemSource) => void;
  onHover?: (target: string | null) => void;
  onStart?: (item: ItemView) => void;
  onEnd?: () => void;
}

export interface ItemCardProps {
  item: ItemView;
  source: ItemSource;
  sprite: SpriteUrl;
  selected?: boolean;
  /** Zaznaczenie wielokrotne: pokazuje znacznik wyboru. */
  multi?: boolean;
  drag: ItemDragHandlers;
  onActivate: (item: ItemView, ev: { x: number; y: number }) => void;
}

export function ItemIcon({ fid, sprite }: { fid: number; sprite: SpriteUrl }) {
  const src = sprite(fid);
  return src ? (
    <img class="f2-inv-icon" src={src} alt="" draggable={false} />
  ) : (
    <span class="f2-inv-icon f2-inv-icon--empty" aria-hidden="true" />
  );
}

export function ItemCard({
  item,
  source,
  sprite,
  selected,
  multi,
  drag,
  onActivate,
}: ItemCardProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const latest = useRef({ item, drag, source, sprite });
  latest.current = { item, drag, source, sprite };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return attachDrag<ItemView>(el, {
      payload: () => latest.current.item,
      createGhost: () => {
        const ghost = document.createElement('div');
        ghost.className = 'f2-inv-ghost';
        ghost.setAttribute('data-testid', 'drag-ghost');
        const url = latest.current.sprite(latest.current.item.fid);
        if (url) {
          const img = document.createElement('img');
          img.src = url;
          img.alt = '';
          ghost.appendChild(img);
        }
        const name = document.createElement('span');
        name.textContent = latest.current.item.name;
        ghost.appendChild(name);
        return ghost;
      },
      onStart: () => latest.current.drag.onStart?.(latest.current.item),
      onHover: (target) => latest.current.drag.onHover?.(target),
      onDrop: (target, payload) =>
        latest.current.drag.onDrop(target, payload, latest.current.source),
      onCancel: () => latest.current.drag.onHover?.(null),
      onEnd: () => latest.current.drag.onEnd?.(),
    });
  }, []);

  return (
    <button
      type="button"
      ref={ref}
      class={`f2-inv-card${selected ? ' f2-inv-card--selected' : ''}`}
      data-testid="inv-item"
      data-item-id={item.id}
      data-source={source}
      aria-pressed={multi ? selected === true : undefined}
      aria-label={
        item.count > 1
          ? t('inventory.item.aria.many', { name: item.name, count: item.count })
          : item.name
      }
      onClick={(e) => onActivate(item, { x: e.clientX, y: e.clientY })}
    >
      <ItemIcon fid={item.fid} sprite={sprite} />
      <span class="f2-inv-card__name">{item.name}</span>
      {item.count > 1 && <span class="f2-inv-card__count">{`x${item.count}`}</span>}
      <span class="f2-inv-card__weight">
        {t('inventory.weight.short', { w: stackWeight(item) })}
      </span>
      {multi && selected && <span class="f2-inv-card__check" aria-hidden="true" />}
    </button>
  );
}
