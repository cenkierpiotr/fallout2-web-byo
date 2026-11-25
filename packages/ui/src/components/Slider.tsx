import { useRef } from 'preact/hooks';

export interface SliderProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  label: string;
}

export const snapValue = (raw: number, min: number, max: number, step: number): number => {
  const snapped = Math.round((raw - min) / step) * step + min;
  return Math.max(min, Math.min(snapped, max));
};

export const Slider = ({ min, max, step, value, onChange, label }: SliderProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fromPointer = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const { left, width } = track.getBoundingClientRect();
    if (width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - left) / width));
    onChange(snapValue(min + ratio * (max - min), min, max, step));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    let next: number;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next = Math.max(min, value - step);
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next = Math.min(max, value + step);
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(next);
  };

  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div class="f2-slider">
      <span class="f2-slider__label">{label}</span>
      <div
        class="f2-slider__track"
        ref={trackRef}
        onPointerDown={(e) => {
          dragging.current = true;
          try {
            trackRef.current?.setPointerCapture(e.pointerId);
          } catch {
            /* brak przechwytywania wskaznika */
          }
          fromPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragging.current) fromPointer(e.clientX);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        <div class="f2-slider__fill" style={{ width: `${percent}%` }} />
        <div
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={String(value)}
          class="f2-slider__thumb"
          style={{ left: `${percent}%` }}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
};
