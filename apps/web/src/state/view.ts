import { signal, type Signal } from '@preact/signals';

export interface ViewState {
  path: Signal<string | null>;
  dir: Signal<number>;
  playing: Signal<boolean>;
  zoom: Signal<number>;
  integerZoom: Signal<boolean>;
  colorCycle: Signal<boolean>;
  frame: Signal<number>;
  frames: Signal<number>;
  fps: Signal<number>;
  directions: Signal<number>;
  size: Signal<string>;
  loading: Signal<boolean>;
  problem: Signal<string | null>;
  /** tryb obciazeniowy (tylko DEV): 100 instancji aktualnego sprite'a */
  stress: Signal<boolean>;
}

export function createView(): ViewState {
  return {
    path: signal<string | null>(null),
    dir: signal(0),
    playing: signal(true),
    zoom: signal(2),
    integerZoom: signal(false),
    colorCycle: signal(true),
    frame: signal(0),
    frames: signal(1),
    fps: signal(0),
    directions: signal(6),
    size: signal(''),
    loading: signal(false),
    problem: signal<string | null>(null),
    stress: signal(false),
  };
}
