import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from '../icons';
import { t } from '../i18n';

export interface TooltipProps {
  content: ComponentChildren;
  children: ComponentChildren;
  trigger?: 'auto' | 'info';
}

let counter = 0;
const LONG_PRESS_MS = 350;

export const Tooltip = ({ content, children, trigger = 'auto' }: TooltipProps) => {
  const [visible, setVisible] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(`f2-tip-${++counter}`);
  const id = idRef.current;

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const show = () => {
    clearTimer();
    setVisible(true);
  };
  const hide = () => {
    clearTimer();
    setVisible(false);
  };

  // aria-describedby na pierwszym elemencie potomnym, gdy tooltip widoczny (tryb auto)
  useEffect(() => {
    if (trigger !== 'auto') return;
    const el = wrapperRef.current?.firstElementChild;
    if (!visible || !el) return;
    el.setAttribute('aria-describedby', id);
    return () => el.removeAttribute('aria-describedby');
  }, [visible, id, trigger]);

  // focus/blur nie babelkuja: nasluch w fazie capture
  useEffect(() => {
    const w = wrapperRef.current;
    if (trigger !== 'auto' || !w) return;
    const onFocus = () => show();
    const onBlur = () => hide();
    w.addEventListener('focus', onFocus, true);
    w.addEventListener('blur', onBlur, true);
    return () => {
      w.removeEventListener('focus', onFocus, true);
      w.removeEventListener('blur', onBlur, true);
    };
  }, [trigger]);

  // long-press dla dotyku (natywne nasluchiwanie: niezalezne od mapowania zdarzen w Preact)
  useEffect(() => {
    const w = wrapperRef.current;
    if (trigger !== 'auto' || !w) return;
    const onDown = (e: Event) => {
      if ((e as PointerEvent).pointerType !== 'touch') return;
      clearTimer();
      timerRef.current = setTimeout(show, LONG_PRESS_MS);
    };
    w.addEventListener('pointerdown', onDown);
    w.addEventListener('pointerup', clearTimer);
    w.addEventListener('pointercancel', clearTimer);
    w.addEventListener('pointerleave', clearTimer);
    return () => {
      w.removeEventListener('pointerdown', onDown);
      w.removeEventListener('pointerup', clearTimer);
      w.removeEventListener('pointercancel', clearTimer);
      w.removeEventListener('pointerleave', clearTimer);
    };
  }, [trigger]);

  useEffect(() => clearTimer, []);

  const bubble = visible && (
    <div role="tooltip" id={id} class="f2-tooltip__bubble">
      {content}
    </div>
  );

  if (trigger === 'info') {
    return (
      <span ref={wrapperRef} class="f2-tooltip">
        {children}
        <button
          type="button"
          class="f2-tooltip__info"
          aria-label={t('common.info')}
          aria-expanded={visible}
          aria-describedby={visible ? id : undefined}
          onClick={() => setVisible((v) => !v)}
        >
          <Icon name="info" size={16} />
        </button>
        {bubble}
      </span>
    );
  }

  return (
    <span
      ref={wrapperRef}
      class="f2-tooltip"
      onMouseEnter={show}
      onMouseLeave={hide}
      onKeyDown={(e) => {
        if (e.key === 'Escape') hide();
      }}
    >
      {children}
      {bubble}
    </span>
  );
};
