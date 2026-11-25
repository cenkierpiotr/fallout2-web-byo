import { createContext, type ComponentChildren } from 'preact';
import { useContext } from 'preact/hooks';
import { useUiArt } from './context';
import './art.css';

export type StageInfo = { w: number; h: number; minTouch: boolean };
const StageSize = createContext<StageInfo | null>(null);

/** Rozmiar tla sceny (jednostki grafiki) lub null poza scena. */
export const useStageInfo = () => useContext(StageSize);

/** Kontener o proporcjach grafiki tla; dzieci w jednostkach grafiki przez ArtAt. */
export function ArtStage(props: {
  background: string;
  children?: ComponentChildren;
  minTouch?: boolean;
}) {
  const img = useUiArt(props.background);
  if (!img) return <div class="f2-art-fallback">{props.children}</div>;
  return (
    <StageSize.Provider value={{ w: img.width, h: img.height, minTouch: !!props.minTouch }}>
      <div class="f2-art-frame">
        <div
          class="f2-art-stage"
          data-art-stage=""
          data-min-touch={props.minTouch ? '1' : undefined}
          style={{
            aspectRatio: `${img.width} / ${img.height}`,
            '--f2-art-ratio': String(img.width / img.height),
            backgroundImage: `url(${img.url})`,
          }}
        >
          {props.children}
        </div>
      </div>
    </StageSize.Provider>
  );
}

export function ArtAt(props: {
  x: number;
  y: number;
  w: number;
  h: number;
  children?: ComponentChildren;
}) {
  const size = useContext(StageSize);
  if (!size) return <div>{props.children}</div>;
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  return (
    <div
      class="f2-art-at"
      data-art-at=""
      style={{
        left: pct(props.x, size.w),
        top: pct(props.y, size.h),
        width: pct(props.w, size.w),
        height: pct(props.h, size.h),
      }}
    >
      {props.children}
    </div>
  );
}
