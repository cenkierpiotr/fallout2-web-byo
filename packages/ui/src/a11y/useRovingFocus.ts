import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';

export type RovingOrientation = 'vertical' | 'horizontal' | 'grid';

export interface RovingOptions {
  /** vertical: gora/dol, horizontal: lewo/prawo, grid: wszystkie strzalki wg polozenia elementow. */
  orientation?: RovingOrientation;
  /** Zawijanie na krancach listy (dla vertical/horizontal). */
  wrap?: boolean;
}

/** Wybiera sasiada w siatce wg geometrii: najblizszy element w zadanym kierunku. */
export function pickGridNeighbor(
  rects: DOMRect[],
  from: number,
  dir: 'up' | 'down' | 'left' | 'right',
): number {
  const a = rects[from];
  if (!a) return from;
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best = -1;
  let bestScore = Infinity;
  rects.forEach((r, i) => {
    if (i === from) return;
    const dx = r.left + r.width / 2 - ax;
    const dy = r.top + r.height / 2 - ay;
    const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    if (along <= 1) return;
    const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    const score = across * 4 + along;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best < 0 ? from : best;
}

/** Nastepny indeks w liscie liniowej (z opcjonalnym zawijaniem). */
export function stepIndex(count: number, current: number, delta: 1 | -1, wrap: boolean): number {
  if (count === 0) return -1;
  const next = current + delta;
  if (next < 0) return wrap ? count - 1 : 0;
  if (next >= count) return wrap ? 0 : count - 1;
  return next;
}

const KEY_DIR: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/**
 * Roving tabindex dla siatek i list: jeden element ma tabindex=0 (Tab wchodzi i wychodzi jednym
 * przystankiem), strzalki przenosza fokus, Home/End skacza na kranice.
 * `selector` wybiera elementy wewnatrz kontenera (np. '[data-testid=inv-item]').
 */
export function useRovingFocus(
  containerRef: RefObject<HTMLElement>,
  selector: string,
  options: RovingOptions = {},
): void {
  const { orientation = 'vertical', wrap = false } = options;
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const items = (): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(selector));
    const sync = (active?: HTMLElement | null): void => {
      const list = items();
      if (list.length === 0) return;
      const cur =
        active && list.includes(active)
          ? active
          : (list.find((e) => e.tabIndex === 0 && e.dataset['roving'] === '1') ?? list[0]!);
      list.forEach((e) => {
        e.tabIndex = e === cur ? 0 : -1;
        e.dataset['roving'] = e === cur ? '1' : '0';
      });
    };
    const onFocusIn = (e: FocusEvent): void => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(selector);
      if (el && root.contains(el)) sync(el);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const list = items();
      const cur = list.findIndex(
        (el) => el === document.activeElement || el.contains(document.activeElement),
      );
      if (cur < 0) return;
      let next = cur;
      if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = list.length - 1;
      else {
        const dir = KEY_DIR[e.key];
        if (!dir) return;
        if (orientation === 'vertical') {
          if (dir === 'left' || dir === 'right') return;
          next = stepIndex(list.length, cur, dir === 'down' ? 1 : -1, wrap);
        } else if (orientation === 'horizontal') {
          if (dir === 'up' || dir === 'down') return;
          next = stepIndex(list.length, cur, dir === 'right' ? 1 : -1, wrap);
        } else {
          next = pickGridNeighbor(
            list.map((el) => el.getBoundingClientRect()),
            cur,
            dir,
          );
        }
      }
      e.preventDefault();
      const target = list[next];
      if (target) {
        sync(target);
        target.focus();
      }
    };
    sync();
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('keydown', onKeyDown);
    const mo = new MutationObserver(() =>
      sync(root.querySelector<HTMLElement>(`${selector}[data-roving="1"]`)),
    );
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('keydown', onKeyDown);
      mo.disconnect();
    };
  }, [containerRef, selector, orientation, wrap]);
}
