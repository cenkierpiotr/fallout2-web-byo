import { Icon, type IconName } from '../icons';

export interface TabsProps {
  items: { id: string; label: string; icon?: IconName }[];
  value: string;
  onChange: (id: string) => void;
  placement: 'top' | 'bottom';
  /** Prefiks id zakladek (role=tab); domyslnie 'f2' => id `f2-tab-<id>`. Unikalny per ekran,
   *  ze dwa moduly z takimi samymi id zakladek nie generowaly duplikatu id w jednym DOM. */
  idPrefix?: string;
}

export const Tabs = ({ items, value, onChange, placement, idPrefix = 'f2' }: TabsProps) => {
  const refs: Array<HTMLButtonElement | null> = [];

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const n = items.length;
    let next: number;
    switch (e.key) {
      case 'ArrowRight':
        next = (index + 1) % n;
        break;
      case 'ArrowLeft':
        next = (index - 1 + n) % n;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = n - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const target = items[next];
    if (!target) return;
    onChange(target.id);
    refs[next]?.focus();
  };

  return (
    <div role="tablist" aria-orientation="horizontal" class={`f2-tabs f2-tabs--${placement}`}>
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(el) => {
            refs[index] = el;
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${item.id}`}
          aria-selected={value === item.id}
          tabIndex={value === item.id ? 0 : -1}
          class="f2-tab"
          onClick={() => onChange(item.id)}
          onKeyDown={(e) => onKeyDown(e, index)}
        >
          {item.icon && <Icon name={item.icon} size={20} />}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
};
