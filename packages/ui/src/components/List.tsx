import type { ComponentChildren } from 'preact';

export interface ListProps<T> {
  items: T[];
  label: string;
  render: (item: T, index: number) => ComponentChildren;
  onSelect?: (item: T, index: number) => void;
}

export function List<T>({ items, label, render, onSelect }: ListProps<T>) {
  return (
    <ul role="list" aria-label={label} class="f2-list">
      {items.map((item, index) => (
        <li class="f2-list__item" key={index}>
          {onSelect ? (
            <button type="button" class="f2-list__button" onClick={() => onSelect(item, index)}>
              {render(item, index)}
            </button>
          ) : (
            render(item, index)
          )}
        </li>
      ))}
    </ul>
  );
}

export interface GridProps<T> {
  items: T[];
  minCell: number;
  label: string;
  render: (item: T, index: number) => ComponentChildren;
}

export function Grid<T>({ items, minCell, label, render }: GridProps<T>) {
  return (
    <ul
      role="list"
      aria-label={label}
      class="f2-grid"
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minCell}px, 1fr))` }}
    >
      {items.map((item, index) => (
        <li key={index}>{render(item, index)}</li>
      ))}
    </ul>
  );
}
