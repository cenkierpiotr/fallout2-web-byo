import { useState } from 'preact/hooks';
import { Button } from '../components/Button';
import { useStageInfo } from './ArtStage';
import { useLayoutMode, useUiArt } from './context';
import './art.css';

export function ArtButton(props: {
  up: string;
  down?: string;
  label: string;
  onClick(): void;
  disabled?: boolean;
  testId?: string;
}) {
  const up = useUiArt(props.up);
  const down = useUiArt(props.down ?? '');
  const layout = useLayoutMode();
  const stage = useStageInfo();
  const [pressed, setPressed] = useState(false);
  if (!up) {
    // Fallback bez FRM: w trybie dotyku cel dotyku tez musi miec min 44px, jak galaz ze skorka nizej.
    // Wartosc idzie przez zmienna CSS, zeby nie nadpisywac wiekszych celow (np. profil touch: 48px).
    const touchFallback = layout === 'touch' || !!stage?.minTouch;
    return (
      <span
        class="f2-art-button__fallback"
        style={touchFallback ? { '--f2-art-touch-min': '44px' } : undefined}
      >
        <Button
          variant="secondary"
          disabled={props.disabled ?? false}
          {...(props.testId ? { 'data-testid': props.testId } : {})}
          onPress={props.onClick}
        >
          {props.label}
        </Button>
      </span>
    );
  }
  const useDown = pressed && props.down && down;
  const img = useDown ? down : up;
  const dim = pressed && !useDown;
  const touch = layout === 'touch' || !!stage?.minTouch;
  const release = () => setPressed(false);
  return (
    <button
      type="button"
      class="f2-art-button"
      disabled={props.disabled}
      aria-label={props.label}
      data-testid={props.testId}
      style={touch ? { minWidth: '44px', minHeight: '44px' } : undefined}
      onPointerDown={() => setPressed(true)}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') setPressed(true);
      }}
      onKeyUp={release}
      onBlur={release}
      onClick={() => {
        if (!props.disabled) props.onClick();
      }}
    >
      <img
        src={img!.url}
        alt=""
        draggable={false}
        style={{
          ...(stage
            ? {
                '--f2-art-w': String((up.width / stage.w) * 100),
                width: 'calc(var(--f2-art-w) * 1cqw)',
              }
            : { width: `${up.width}px` }),
          ...(dim ? { filter: 'brightness(.7)' } : {}),
        }}
      />
    </button>
  );
}
