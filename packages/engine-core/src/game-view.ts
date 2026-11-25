import type { DialogState } from '@f2/vm';
import type { FloatingText } from './floating-text.js';
import type { Hex } from './hexgrid.js';

/** Minimalny sygnal zgodny strukturalnie z @preact/signals (value + subscribe). */
export interface Signal<T> {
  value: T;
  subscribe(fn: (v: T) => void): () => void;
}

export function createSignal<T>(initial: T): Signal<T> {
  let v = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get value() {
      return v;
    },
    set value(n: T) {
      if (Object.is(n, v)) return;
      v = n;
      for (const f of [...subs]) f(v);
    },
    subscribe(fn) {
      subs.add(fn);
      fn(v);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

/** Widok stanu gry dla UI (tylko pola potrzebne w M2; rozszerzane w M3). */
export interface GameView {
  player: Signal<{ hex: Hex; elevation: number; moving: boolean }>;
  currentMap: Signal<{ name: string; elevation: number }>;
  notifications: Signal<string[]>;
  /** Aktywna rozmowa (migawka stanu z DialogSession) lub null. */
  dialog: Signal<DialogState | null>;
  floatingTexts: Signal<FloatingText[]>;
}

export function createGameView(): GameView {
  return {
    player: createSignal({ hex: -1, elevation: 0, moving: false }),
    currentMap: createSignal({ name: '', elevation: 0 }),
    notifications: createSignal<string[]>([]),
    dialog: createSignal<DialogState | null>(null),
    floatingTexts: createSignal<FloatingText[]>([]),
  };
}
