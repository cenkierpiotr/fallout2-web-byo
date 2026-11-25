import { signal, type Signal } from '@preact/signals';
import { useEffect, useMemo } from 'preact/hooks';

/** Rdzen animacji: co 1000/fps ms zwieksza klatke modulo frames. Zwraca funkcje zatrzymujaca. */
export function runAnimation(
  frame: Signal<number>,
  fps: number,
  frames: number,
  playing: boolean,
): () => void {
  if (frame.peek() >= Math.max(frames, 1)) frame.value = 0;
  if (!playing || fps <= 0 || frames <= 1) return () => {};
  const id = setInterval(() => {
    frame.value = (frame.peek() + 1) % frames;
  }, 1000 / fps);
  return () => clearInterval(id);
}

export function useAnimation(fps: number, frames: number, playing: boolean): Signal<number> {
  const frame = useMemo(() => signal(0), []);
  useEffect(() => runAnimation(frame, fps, frames, playing), [frame, fps, frames, playing]);
  return frame;
}
