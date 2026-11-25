/**
 * Drag&drop na Pointer Events (mysz i dotyk). Bez zaleznosci od Preact.
 *  - mysz: przeciaganie po przesunieciu o MOVE_THRESHOLD px,
 *  - dotyk: przeciaganie po przytrzymaniu LONG_PRESS_MS (wczesniejszy ruch = przewijanie listy),
 *  - `setPointerCapture` na zrodle, duch (ghost) na `document.body`, haptyka `navigator.vibrate(10)`,
 *  - cel = najblizszy element z atrybutem `data-drop` pod wskaznikiem,
 *  - `pointercancel`, Escape i odlaczenie zawsze sprzataja ducha i nie wywoluja upuszczenia.
 */

export const MOVE_THRESHOLD = 6;
export const LONG_PRESS_MS = 220;
export const DROP_ATTR = 'data-drop';

export interface DragConfig<P> {
  /** Ladunek przekazywany do `onDrop`; wywolywany w chwili startu przeciagania. */
  payload: () => P;
  /** Element-duch dokladany do body na czas przeciagania. */
  createGhost: () => HTMLElement;
  /** `target` = wartosc `data-drop` celu pod wskaznikiem albo null (poza celami). */
  onDrop: (target: string | null, payload: P) => void;
  onStart?: () => void;
  /** Zakonczenie bez upuszczenia (pointercancel, Escape, odlaczenie). */
  onCancel?: () => void;
  /** Zmiana celu pod wskaznikiem w trakcie przeciagania. */
  onHover?: (target: string | null) => void;
  /** Zawsze po zakonczeniu przeciagania (upuszczenie lub anulowanie). */
  onEnd?: () => void;
}

function dropTargetAt(x: number, y: number): string | null {
  const el =
    typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
  return el?.closest(`[${DROP_ATTR}]`)?.getAttribute(DROP_ATTR) ?? null;
}

function haptic(): void {
  try {
    navigator.vibrate?.(10);
  } catch {
    /* brak wibracji */
  }
}

interface Session<P> {
  id: number;
  touch: boolean;
  x0: number;
  y0: number;
  x: number;
  y: number;
  started: boolean;
  ghost: HTMLElement | null;
  payload: P | undefined;
  hover: string | null;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Podpina przeciaganie do elementu; zwraca funkcje odlaczajaca. */
export function attachDrag<P>(el: HTMLElement, cfg: DragConfig<P>): () => void {
  let s: Session<P> | null = null;
  let suppressClick = false;

  const moveGhost = (x: number, y: number) => {
    if (s?.ghost) s.ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  };

  const finish = (): Session<P> | null => {
    const cur = s;
    s = null;
    if (!cur) return null;
    if (cur.timer !== null) clearTimeout(cur.timer);
    cur.ghost?.remove();
    try {
      if (el.hasPointerCapture?.(cur.id)) el.releasePointerCapture(cur.id);
    } catch {
      /* wskaznik juz zwolniony */
    }
    if (cur.started) cfg.onEnd?.();
    return cur;
  };

  const begin = () => {
    if (!s || s.started) return;
    s.started = true;
    s.payload = cfg.payload();
    const ghost = cfg.createGhost();
    ghost.style.position = 'fixed';
    ghost.style.left = '0';
    ghost.style.top = '0';
    ghost.style.pointerEvents = 'none';
    document.body.appendChild(ghost);
    s.ghost = ghost;
    moveGhost(s.x, s.y);
    haptic();
    cfg.onStart?.();
  };

  const onDown = (e: PointerEvent) => {
    if (s) return;
    if (e.pointerType === 'mouse' && e.button > 0) return;
    const touch = e.pointerType !== 'mouse';
    s = {
      id: e.pointerId,
      touch,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      started: false,
      ghost: null,
      payload: undefined,
      hover: null,
      timer: touch ? setTimeout(begin, LONG_PRESS_MS) : null,
    };
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* np. syntetyczne zdarzenie bez aktywnego wskaznika */
    }
  };

  const onMove = (e: PointerEvent) => {
    if (!s || e.pointerId !== s.id) return;
    s.x = e.clientX;
    s.y = e.clientY;
    if (!s.started) {
      const far = Math.hypot(s.x - s.x0, s.y - s.y0) > MOVE_THRESHOLD;
      if (!far) return;
      if (s.touch) {
        // ruch przed dlugim przytrzymaniem = przewijanie, nie przeciaganie
        finish();
        return;
      }
      begin();
    }
    moveGhost(s.x, s.y);
    const target = dropTargetAt(s.x, s.y);
    if (target !== s.hover) {
      s.hover = target;
      cfg.onHover?.(target);
    }
  };

  const onUp = (e: PointerEvent) => {
    if (!s || e.pointerId !== s.id) return;
    s.x = e.clientX;
    s.y = e.clientY;
    const wasStarted = s.started;
    const target = wasStarted ? dropTargetAt(s.x, s.y) : null;
    const cur = finish();
    if (!cur || !wasStarted) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    cfg.onDrop(target, cur.payload as P);
  };

  const onCancel = (e: PointerEvent) => {
    if (!s || e.pointerId !== s.id) return;
    const was = s.started;
    finish();
    if (was) cfg.onCancel?.();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !s?.started) return;
    finish();
    cfg.onCancel?.();
  };

  const onTouchMove = (e: TouchEvent) => {
    if (s?.started && e.cancelable) e.preventDefault();
  };

  const onClick = (e: MouseEvent) => {
    if (suppressClick) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('touchmove', onTouchMove, { passive: false });
  el.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey);

  return () => {
    const was = s?.started;
    finish();
    if (was) cfg.onCancel?.();
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('touchmove', onTouchMove);
    el.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey);
  };
}
