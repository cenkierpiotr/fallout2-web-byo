import type { RefObject } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';

/**
 * Natywny nasluch zdarzenia na elemencie z ref (zawsze najnowszy handler).
 * Preact mapuje nazwy onPointerDown roznie w zaleznosci od srodowiska; natywny
 * addEventListener jest jednoznaczny (przegladarka i jsdom).
 */
export function useNativeEvent<E extends Event>(
  ref: RefObject<HTMLElement>,
  type: string,
  handler: (e: E) => void,
  active = true,
): void {
  const h = useRef(handler);
  h.current = handler;
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const fn = (e: Event) => h.current(e as E);
    el.addEventListener(type, fn);
    return () => el.removeEventListener(type, fn);
  }, [ref, type, active]);
}

export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

const escapeStack: symbol[] = [];

/**
 * Zamkniecie dialogu klawiszem Escape niezaleznie od fokusu: gdy fokus jeszcze nie wszedl do dialogu
 * (efekt fokusu pod obciazeniem) albo go opuscil, onKeyDown na dialogu nie zadziala. Reaguje tylko
 * najwyzszy otwarty dialog; zdarzenie obsluzone juz przez dialog (defaultPrevented) jest pomijane.
 * Nasluch rejestrowany w efekcie ukladu (synchronicznie po wstawieniu dialogu do DOM): zwykly `useEffect`
 * startuje dopiero po malowaniu, wiec pod obciazeniem Escape wcisniety zaraz po pojawieniu sie dialogu
 * (jak w e2e mobile-ingame-panel) bywal gubiony, a backdrop dalej przechwytywal klikniecia.
 */
export function useEscapeClose(open: boolean, onClose: () => void): void {
  const h = useRef(onClose);
  h.current = onClose;
  useLayoutEffect(() => {
    if (!open) return;
    const id = Symbol('escape-close');
    escapeStack.push(id);
    const fn = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (escapeStack[escapeStack.length - 1] !== id) return;
      e.preventDefault();
      h.current();
    };
    document.addEventListener('keydown', fn);
    return () => {
      document.removeEventListener('keydown', fn);
      const i = escapeStack.indexOf(id);
      if (i >= 0) escapeStack.splice(i, 1);
    };
  }, [open]);
}
