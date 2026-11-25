import { useEffect, useRef } from 'preact/hooks';
import { effect, type ReadonlySignal } from '@preact/signals';
import { drawHead, type HeadFrame } from './head-draw';

/**
 * Glowa mowiaca: rysuje klatke FRM (plik P glowy, 9 klatek) wybrana sygnalem `mouth` (0..8)
 * z DialogAudio. Klatki (RGBA) przygotowuje wywolujacy (parseFrm + frameToRgba).
 */
export function TalkingHead({
  frames,
  mouth,
}: {
  frames: readonly HeadFrame[];
  mouth: ReadonlySignal<number>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const first = frames[0];
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    return effect(() => {
      drawHead(
        ctx,
        frames,
        mouth.value,
        (d, w, h) => new ImageData(new Uint8ClampedArray(d), w, h),
      );
    });
  }, [frames, mouth]);
  return (
    <canvas
      ref={ref}
      class="talking-head"
      data-testid="talking-head"
      width={first?.width ?? 1}
      height={first?.height ?? 1}
      role="img"
      aria-label="Head"
    />
  );
}
