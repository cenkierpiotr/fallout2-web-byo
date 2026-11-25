import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { detectLayout, type LayoutMode } from './layout-mode';

export type UiArtImage = { url: string; width: number; height: number };
export type UiArtSource = {
  get(name: string, frame?: number): UiArtImage | null | undefined;
  subscribe(cb: () => void): () => void;
};

type Ctx = { source: UiArtSource | null; layout: LayoutMode | undefined };
const ArtContext = createContext<Ctx>({ source: null, layout: undefined });

export function UiArtProvider(props: {
  source: UiArtSource | null;
  layout?: LayoutMode;
  children?: ComponentChildren;
}) {
  const value = useMemo(
    () => ({ source: props.source, layout: props.layout }),
    [props.source, props.layout],
  );
  return <ArtContext.Provider value={value}>{props.children}</ArtContext.Provider>;
}

/** Obraz z zrodla; null podczas ladowania i bez providera. */
export function useUiArt(name: string, frame?: number): UiArtImage | null {
  const { source } = useContext(ArtContext);
  const [, bump] = useState(0);
  useEffect(() => {
    if (!source) return;
    const unsub = source.subscribe(() => bump((n) => n + 1));
    bump((n) => n + 1);
    return unsub;
  }, [source]);
  return source?.get(name, frame) ?? null;
}

export function useLayoutMode(): LayoutMode {
  const { layout } = useContext(ArtContext);
  const [auto, setAuto] = useState<LayoutMode>(() =>
    typeof window === 'undefined' ? 'pc' : detectLayout(window),
  );
  useEffect(() => {
    if (layout || typeof window === 'undefined') return;
    setAuto(detectLayout(window));
    const update = () => setAuto(detectLayout(window));
    const mq =
      typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null;
    mq?.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    return () => {
      mq?.removeEventListener?.('change', update);
      window.removeEventListener('resize', update);
    };
  }, [layout]);
  return layout ?? auto;
}
