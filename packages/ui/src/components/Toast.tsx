import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';

export type ToastTone = 'ok' | 'warning' | 'danger' | 'info';

export interface ToastApi {
  show: (message: string, tone?: ToastTone, ms?: number) => void;
}

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<ToastApi | null>(null);

export const ToastProvider = ({ children }: { children?: ComponentChildren }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const set = timers.current;
    return () => {
      for (const t of set) clearTimeout(t);
      set.clear();
    };
  }, []);

  const show = useCallback((message: string, tone: ToastTone = 'info', ms = 4000) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, ms);
    timers.current.add(timer);
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div role="status" aria-live="polite" class="f2-toast-region">
        {toasts.map((t) => (
          <div key={t.id} class={`f2-toast f2-toast--${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastApi => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast musi byc uzyty wewnatrz ToastProvider');
  return ctx;
};
