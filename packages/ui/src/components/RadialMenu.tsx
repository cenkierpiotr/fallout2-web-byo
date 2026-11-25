import { Icon } from '../icons';
import type { MenuItem } from './ContextMenu';

export interface RadialMenuProps {
  items: MenuItem[];
  center: { x: number; y: number };
  onSelect: (id: string) => void;
  onClose?: () => void;
  radius?: number;
}

export const RADIAL_MAX_ITEMS = 8;
const ITEM_SIZE = 56;

const r2 = (x: number): number => Number(x.toFixed(2)) + 0;

export function RadialMenu({ items, center, onSelect, onClose, radius = 96 }: RadialMenuProps) {
  if (items.length > RADIAL_MAX_ITEMS) {
    console.warn(`RadialMenu: max ${RADIAL_MAX_ITEMS} elementow, nadmiarowe pominiete`);
  }
  const shown = items.slice(0, RADIAL_MAX_ITEMS);
  const n = shown.length;
  if (n === 0) return null;

  return (
    <div
      role="menu"
      class="f2-radial"
      style={{ left: `${center.x}px`, top: `${center.y}px` }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose?.();
      }}
    >
      {shown.map((item, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            class="f2-radial__item"
            aria-label={item.label}
            aria-disabled={item.disabled === true}
            style={{
              left: `${r2(radius * Math.cos(angle))}px`,
              top: `${r2(radius * Math.sin(angle))}px`,
              width: `${ITEM_SIZE}px`,
              height: `${ITEM_SIZE}px`,
            }}
            onClick={() => {
              if (!item.disabled) onSelect(item.id);
            }}
          >
            <Icon name={item.icon ?? 'use'} size={28} />
          </button>
        );
      })}
    </div>
  );
}
