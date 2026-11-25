import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { focusables, useEscapeClose, useNativeEvent } from '../hooks';
import { t } from '../i18n';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  snap: 'half' | 'full';
  children?: ComponentChildren;
}

const CLOSE_DISTANCE = 80;

export const Sheet = ({ open, onClose, snap, children }: SheetProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const dy = useRef(0);
  const dragging = useRef(false);

  // fokus do panelu po otwarciu, przywrocenie poprzedniego elementu po zamknieciu
  useEffect(() => {
    if (!open) return;
    const saved = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      if (saved && document.contains(saved)) saved.focus();
    };
  }, [open]);

  const setTransform = (px: number) => {
    const el = dialogRef.current;
    if (el) el.style.transform = px > 0 ? `translateY(${px}px)` : '';
  };

  useNativeEvent<PointerEvent>(
    handleRef,
    'pointerdown',
    (e) => {
      dragging.current = true;
      startY.current = e.clientY;
      dy.current = 0;
      try {
        handleRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* brak przechwytywania wskaznika */
      }
    },
    open,
  );

  useNativeEvent<PointerEvent>(
    handleRef,
    'pointermove',
    (e) => {
      if (!dragging.current) return;
      dy.current = Math.max(0, e.clientY - startY.current);
      setTransform(dy.current);
    },
    open,
  );

  const end = (close: boolean) => {
    if (!dragging.current) return;
    dragging.current = false;
    const distance = dy.current;
    dy.current = 0;
    setTransform(0);
    if (close && distance > CLOSE_DISTANCE) onClose();
  };
  useNativeEvent<PointerEvent>(handleRef, 'pointerup', () => end(true), open);
  useNativeEvent<PointerEvent>(handleRef, 'pointercancel', () => end(false), open);

  useEscapeClose(open, onClose);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('common.panel')}
      class={`f2-sheet f2-sheet--${snap}`}
      ref={dialogRef}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
          return;
        }
        // pulapka fokusu (aria-modal): Tab krazy w obrebie panelu
        if (e.key !== 'Tab' || !dialogRef.current) return;
        const list = focusables(dialogRef.current);
        const first = list[0];
        const last = list[list.length - 1];
        if (!first || !last) {
          e.preventDefault();
          return;
        }
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === dialogRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }}
    >
      <div class="f2-sheet__handle" data-testid="sheet-handle" ref={handleRef}>
        <span class="f2-sheet__grip" />
      </div>
      <div class="f2-sheet__body">{children}</div>
    </div>
  );
};
