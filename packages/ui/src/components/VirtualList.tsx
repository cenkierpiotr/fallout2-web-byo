import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

export interface VirtualListProps<T> {
  items: T[];
  rowHeight: number;
  height: number;
  overscan?: number;
  label: string;
  render: (item: T, index: number) => ComponentChildren;
}

export function VirtualList<T>({
  items,
  rowHeight,
  height,
  overscan = 3,
  label,
  render,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + overscan);

  const rows = [];
  for (let i = start; i < end; i++) {
    rows.push(
      <div
        role="listitem"
        data-index={i}
        key={i}
        class="f2-vlist__row"
        style={{
          position: 'absolute',
          top: `${i * rowHeight}px`,
          height: `${rowHeight}px`,
          left: 0,
          right: 0,
        }}
      >
        {render(items[i] as T, i)}
      </div>,
    );
  }

  return (
    <div
      role="list"
      aria-label={label}
      class="f2-vlist"
      tabIndex={0}
      style={{ height: `${height}px`, overflowY: 'auto' }}
      onScroll={(e) => setScrollTop((e.currentTarget as HTMLElement).scrollTop)}
    >
      <div
        class="f2-vlist__inner"
        style={{ height: `${items.length * rowHeight}px`, position: 'relative' }}
      >
        {rows}
      </div>
    </div>
  );
}
