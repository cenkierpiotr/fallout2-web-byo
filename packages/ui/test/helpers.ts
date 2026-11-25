import { fireEvent } from '@testing-library/preact';

/** jsdom nie ma PointerEvent: zdarzenie Event z doklejonymi polami. */
export function pointer(
  el: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  props: { clientX?: number; clientY?: number; pointerType?: string; pointerId?: number } = {},
): void {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, { clientX: 0, clientY: 0, pointerType: 'touch', pointerId: 1, ...props });
  fireEvent(el, ev);
}
