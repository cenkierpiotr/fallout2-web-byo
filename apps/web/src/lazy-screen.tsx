import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/**
 * Leniwe ladowanie ekranu: modul (i jego zaleznosci) trafia do osobnego chunka pobieranego
 * dopiero przy pierwszym wyswietleniu. Bez preact/compat. Wynik ladowania jest pamietany,
 * wiec kolejne wyswietlenia sa synchroniczne.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = any;

export function lazyScreen(
  load: () => Promise<(props: AnyProps) => unknown>,
): ComponentType<AnyProps> {
  let loaded: ComponentType<AnyProps> | null = null;
  let pending: Promise<void> | null = null;
  const start = (): Promise<void> =>
    (pending ??= load().then((c) => {
      loaded = c as ComponentType<AnyProps>;
    }));
  return function LazyScreen(props: AnyProps) {
    const [, force] = useState(0);
    useEffect(() => {
      if (!loaded) void start().then(() => force((n) => n + 1));
    }, []);
    const C = loaded;
    return C ? <C {...props} /> : null;
  };
}
