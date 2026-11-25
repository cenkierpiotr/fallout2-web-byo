import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { focusables, useEscapeClose } from '../hooks';
import { IconButton } from './IconButton';
import { t } from '../i18n';
import { useUiArt } from '../art/context';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ComponentChildren;
  /** Nazwa tla skorki ekranu (np. 'inv.bg'); gdy grafika jest dostepna, okno jest pelnoekranowe. */
  artBackground?: string;
}

let titleIdCounter = 0;

export const Modal = ({ open, title, onClose, children, artBackground }: ModalProps) => {
  const [id] = useState(() => `f2-modal-title-${++titleIdCounter}`);
  const dialogRef = useRef<HTMLDivElement>(null);
  const artImg = useUiArt(artBackground ?? '');
  const full = !!artBackground && !!artImg;

  // fokus na pierwszy element po otwarciu, przywrocenie przy zamknieciu
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const saved = document.activeElement as HTMLElement | null;
    focusables(dialog)[0]?.focus();
    return () => {
      if (saved && document.contains(saved)) saved.focus();
    };
  }, [open]);

  useEscapeClose(open, onClose);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const list = focusables(dialogRef.current);
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      class={`f2-modal__backdrop${full ? ' f2-modal__backdrop--art' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        class={`f2-modal${full ? ' f2-modal--art' : ''}`}
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <header class="f2-modal__header">
          <h2 id={id} class="f2-modal__title">
            {title}
          </h2>
          <IconButton icon="close" label={t('common.close')} onPress={onClose} />
        </header>
        <div class="f2-modal__body">{children}</div>
      </div>
    </div>
  );
};
