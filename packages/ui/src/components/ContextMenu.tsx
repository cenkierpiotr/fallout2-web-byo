import { useEffect, useRef } from 'preact/hooks';
import { Icon, type IconName } from '../icons';

export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  disabled?: boolean;
}

export interface ContextMenuProps {
  items: MenuItem[];
  anchor: { x: number; y: number };
  onSelect: (id: string) => void;
  onClose?: () => void;
}

const ENABLED = '[role="menuitem"]:not([aria-disabled="true"])';

export function ContextMenu({ items, anchor, onSelect, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>(ENABLED)?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    const menu = menuRef.current;
    if (!menu) return;
    const list = Array.from(menu.querySelectorAll<HTMLElement>(ENABLED));
    const idx = list.indexOf(e.target as HTMLElement);
    const n = list.length;
    if (n === 0) return;
    let next: HTMLElement | undefined;
    switch (e.key) {
      case 'ArrowDown':
        next = list[(idx + 1) % n];
        break;
      case 'ArrowUp':
        next = list[(idx - 1 + n) % n];
        break;
      case 'Home':
        next = list[0];
        break;
      case 'End':
        next = list[n - 1];
        break;
      case 'Escape':
        e.preventDefault();
        onClose?.();
        return;
      default:
        return;
    }
    e.preventDefault();
    next?.focus();
  };

  return (
    <div
      role="menu"
      class="f2-menu"
      style={{ left: `${anchor.x}px`, top: `${anchor.y}px` }}
      ref={menuRef}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          class="f2-menu__item"
          aria-disabled={item.disabled === true}
          tabIndex={-1}
          onClick={() => {
            if (!item.disabled) onSelect(item.id);
          }}
        >
          {item.icon && <Icon name={item.icon} size={20} />}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
